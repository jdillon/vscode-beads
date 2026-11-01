import { RefreshCoordinator } from "../refresh-coordinator";

describe("refresh coordinator", () => {
  it("coalesces a burst into one trailing load without overlapping reads", async () => {
    let release!: () => void;
    const refresh = jest.fn().mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }))
      .mockResolvedValue(undefined);
    const coordinator = new RefreshCoordinator(refresh, jest.fn());
    coordinator.request();
    for (let i = 0; i < 100; i++) coordinator.request();
    expect(refresh).toHaveBeenCalledTimes(1);
    release();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(2);
    coordinator.dispose();
  });

  it("drops pending work on disposal", async () => {
    let release!: () => void;
    const refresh = jest.fn(() => new Promise<void>(resolve => { release = resolve; }));
    const coordinator = new RefreshCoordinator(refresh, jest.fn());
    coordinator.request(); coordinator.request(); coordinator.dispose(); release();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
