import { PassThrough } from "stream";
import { EventEmitter } from "events";
import { spawn } from "child_process";
import { BeadsChangeSource, JournalJsonParser, JournalSseParser } from "../beads-change-source";

jest.mock("child_process", () => ({ spawn: jest.fn() }));
const tick = async () => { for (let n = 0; n < 10; n++) await Promise.resolve(); };

describe("journal framing", () => {
  it("handles fragmented UTF-8, escaped braces and pretty initial truncation", () => {
    const records: unknown[] = [];
    const parser = new JournalJsonParser(value => records.push(value));
    const bytes = Buffer.from('{"seq":1,"title":"é } \\\""}\n{\n "code":"events_journal_truncated",\n "head":9\n}\n');
    for (const byte of bytes) parser.push(Buffer.from([byte]));
    parser.finish();
    expect(records).toEqual([{ seq: 1, title: 'é } "' }, { code: "events_journal_truncated", head: 9 }]);
  });
  it("frames SSE, ignores heartbeat, checks ids and detects truncated frames", () => {
    const records: unknown[] = [];
    const parser = new JournalSseParser(value => records.push(value));
    const bytes = Buffer.from(': heartbeat\r\n\r\nretry: 3000\n\nid: 1\ndata: {"seq":1,"title":"é"}\n\nevent: truncated\ndata: {"code":"events_journal_truncated","head":9}\n\n');
    for (const byte of bytes) parser.push(Buffer.from([byte]));
    parser.finish();
    expect(records).toHaveLength(2);
    expect(() => parser.push(Buffer.from('id: 2\ndata: {"seq":3}\n\n'))).toThrow("cursor");
    const unfinished = new JournalJsonParser(() => {});
    unfinished.push(Buffer.from('{"seq":'));
    expect(() => unfinished.finish()).toThrow("Incomplete");
  });
  it("rejects oversized frames and unsafe SSE ids", () => {
    expect(() => new JournalJsonParser(() => {}).push(Buffer.from('{"x":"' + "x".repeat(4 * 1024 * 1024)))).toThrow("too large");
    expect(() => new JournalSseParser(() => {}).push(Buffer.from('id: 9007199254740992\ndata: {"seq":9007199254740992}\n\n'))).toThrow("unsafe");
  });
});

describe("change-source lifecycle", () => {
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });
  function setup() {
    const onChange = jest.fn(); const onState = jest.fn(); const warn = jest.fn();
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(), stderr: new PassThrough(), kill: jest.fn(), exitCode: null, signalCode: null,
    });
    (spawn as jest.Mock).mockReturnValue(child);
    const options = { bdPath: "/bd", cwd: "/project", beadsDir: "/project/.beads", log: { warn }, onChange, onState };
    return { child, options, onChange, onState };
  }
  it("coalesces bursts, suppresses duplicates, and kills only the owned child on disposal", async () => {
    const { child, options, onChange } = setup();
    const source = new BeadsChangeSource(options); source.start(); await tick();
    child.stdout.write('{"seq":1}\n{"seq":2}\n{"seq":2}\n');
    jest.advanceTimersByTime(50); expect(onChange).toHaveBeenCalledTimes(1);
    child.stdout.write('{"seq":2}\n'); jest.advanceTimersByTime(50);
    expect(onChange).toHaveBeenCalledTimes(1);
    source.dispose(); child.stdout.write('{"seq":3}\n'); jest.advanceTimersByTime(5000);
    expect(onChange).toHaveBeenCalledTimes(1); expect(child.kill).toHaveBeenCalled();
    expect(spawn).toHaveBeenCalledTimes(1);
  });
  it("stops on the fragmented disabled notice without retrying", async () => {
    const { child, options, onState } = setup();
    const source = new BeadsChangeSource(options); source.start(); await tick();
    child.stderr.write("note: the events journal is "); child.stderr.write("disabled for this workspace");
    await tick(); jest.advanceTimersByTime(60000); await tick();
    expect(onState).toHaveBeenCalledWith("disabled"); expect(spawn).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalled(); source.dispose();
  });
  it("rebaselines initial pretty truncation and resumes at its head", async () => {
    const { child, options, onChange } = setup();
    const source = new BeadsChangeSource(options); source.start(); await tick();
    child.stdout.write('{\n "code":"events_journal_truncated",\n "head":42\n}\n'); await tick();
    jest.advanceTimersByTime(1000); await tick();
    expect(onChange).toHaveBeenCalled();
    expect((spawn as jest.Mock).mock.calls[1][1]).toContain("42"); source.dispose();
  });
  it("rejects unsafe CLI cursors without advancing the checkpoint", async () => {
    const { child, options } = setup();
    const source = new BeadsChangeSource(options); source.start(); await tick();
    child.stdout.write('{"seq":9007199254740992}\n'); await tick();
    jest.advanceTimersByTime(1000); await tick();
    expect((spawn as jest.Mock).mock.calls[1][1]).toContain("0"); source.dispose();
  });
  it("coalesces SSE events including unknown operations and ignores callbacks after stop", async () => {
    const { options, onChange } = setup();
    const stream = new PassThrough();
    const source = new BeadsChangeSource({ ...options, getHttpClient: async () => ({
      openStream: async (_path, signal) => {
        signal.addEventListener("abort", () => stream.destroy());
        return stream;
      },
    }) });
    source.start(); await tick();
    stream.write('id: 1\ndata: {"seq":1,"op":"future_operation"}\n\nid: 1\ndata: {"seq":1}\n\n');
    await tick(); jest.advanceTimersByTime(50);
    expect(onChange).toHaveBeenCalledTimes(1);
    source.dispose(); await tick(); jest.advanceTimersByTime(60000);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(stream.destroyed).toBe(true);
  });
  it("resets the checkpoint when a restarted HTTP session returns a new client", async () => {
    const { options, onChange } = setup();
    const firstStream = { async *[Symbol.asyncIterator]() {
      yield Buffer.from('id: 50\ndata: {"seq":50}\n\n');
      throw new Error("Server exited");
    } };
    const firstClient = { openStream: jest.fn().mockResolvedValue(firstStream) };
    const secondClient = { openStream: jest.fn().mockRejectedValue({ code: "events_journal_disabled" }) };
    const getHttpClient = jest.fn().mockResolvedValueOnce(firstClient).mockResolvedValueOnce(secondClient);
    const source = new BeadsChangeSource({ ...options, getHttpClient });
    source.start(); await tick();
    jest.advanceTimersByTime(1000); await tick();
    expect(secondClient.openStream.mock.calls[0][0]).toContain("since=0");
    jest.advanceTimersByTime(50); expect(onChange).toHaveBeenCalled(); source.dispose();
  });
  it("backs off repeated connection failures up to 30 seconds", async () => {
    const { options } = setup();
    const openStream = jest.fn().mockRejectedValue(new Error("offline"));
    const source = new BeadsChangeSource({ ...options, getHttpClient: async () => ({ openStream }) });
    source.start(); await tick();
    for (const delay of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
      const before = openStream.mock.calls.length;
      jest.advanceTimersByTime(delay - 1); await tick();
      expect(openStream).toHaveBeenCalledTimes(before);
      jest.advanceTimersByTime(1); await tick();
      expect(openStream).toHaveBeenCalledTimes(before + 1);
    }
    source.dispose();
  });
  it("handles HTTP disabled, 410 reset, and cancelled acquisition", async () => {
    const { options, onState, onChange } = setup();
    const openStream = jest.fn().mockRejectedValueOnce({ status: 410, body: { head: 40 } })
      .mockRejectedValueOnce({ status: 409, code: "events_journal_disabled" });
    const client = { openStream };
    const source = new BeadsChangeSource({ ...options, getHttpClient: async () => client });
    source.start(); await tick(); jest.advanceTimersByTime(1000); await tick();
    expect(openStream.mock.calls[1][0]).toContain("since=40");
    expect(onChange).toHaveBeenCalled(); expect(onState).toHaveBeenCalledWith("disabled");
    source.dispose();
    let resolve!: (client: { openStream: typeof openStream }) => void;
    const late = new BeadsChangeSource({ ...options, getHttpClient: () => new Promise(done => { resolve = done; }) });
    late.start(); late.dispose(); resolve({ openStream }); await tick();
    expect(openStream).toHaveBeenCalledTimes(2);
  });
});
