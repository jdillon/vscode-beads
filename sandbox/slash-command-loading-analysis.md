# Slash Command Loading Behavior Analysis

**Date**: 2025-12-23
**Purpose**: Determine if slash command content is loaded once per session or on each invocation

## Summary

**Finding**: Slash command content enters the context window **each time** the command is invoked. Content is injected as a user message with `isMeta: true`, not cached or referenced.

## Test Methodology

### 1. Create a Test Command with Unique Marker

Create a simple command with a grep-able marker:

```bash
cat > .claude/commands/test-slash-loading.md << 'EOF'
---
description: Test slash command loading behavior
allowed-tools: Read, Bash
model: haiku
---

# Test Slash Command Loading Behavior

This command has a UNIQUE_MARKER_12345 that we can grep for in transcripts.

## Instructions

Just acknowledge you received this command by saying:
```
TEST_ACK_OK: UNIQUE_MARKER_12345
```
EOF
```

### 2. Run Claude in Sub-Shell

Run `claude -p` from a terminal (or from within Claude using Bash tool):

```bash
# Single invocation - creates new session
claude -p "/test-slash-loading"

# Find the session that was created
ls -lt ~/.claude/projects/-Users-jason-ws-jdillon-vscode-beads/*.jsonl | grep -v agent | head -3
```

**Key flags**:
- `-p "<prompt>"` - Print mode, non-interactive
- `-c` - Continue most recent session
- `-r <session-id>` - Resume specific session
- `--session-id <uuid>` - Use specific session ID
- `--debug` - Enable debug logging to `~/.claude/debug/<session-id>.txt`

### 3. Analyze Session Transcript

Session transcripts are JSONL files at:
```
~/.claude/projects/<project-path-with-dashes>/<session-uuid>.jsonl
```

**Useful analysis commands**:

```bash
SESSION=~/.claude/projects/-Users-jason-ws-jdillon-vscode-beads/<session-id>.jsonl

# Count marker occurrences
grep -c "UNIQUE_MARKER_12345" "$SESSION"

# View message structure
cat "$SESSION" | jq -c '{type: .type, isMeta: .isMeta?, content: (.message.content | if type == "string" then .[0:60] else (.[0].text // .[0].name)[0:60] end)}'

# Find command-message tags (slash command triggers)
grep -c '<command-message>test-slash-loading</command-message>' "$SESSION"

# Extract just user messages
cat "$SESSION" | jq 'select(.type == "user") | .message.content'
```

### 4. Check Debug Logs

Debug logs show internal processing:

```bash
DEBUG_LOG=~/.claude/debug/<session-id>.txt

# Search for command processing
grep -n "processPromptSlashCommand\|command-message\|ATTACHMENT" "$DEBUG_LOG"

# See message creation
grep -n "Message [0-9]:" "$DEBUG_LOG"
```

## Findings

### Commands vs Skills

| Type | Location | How Content Loads |
|------|----------|-------------------|
| **Command** | `.claude/commands/*.md` | Direct injection as user message with `isMeta:true` |
| **Skill** | `.claude/skills/*/SKILL.md` | Skill tool returns routing info → Claude reads file with Read tool |

### Command Loading Flow

When user types `/test-slash-loading`:

```
1. System creates user message:
   {"content": "<command-message>test-slash-loading</command-message>\n<command-name>/test-slash-loading</command-name>"}

2. System creates meta message with FULL CONTENT:
   {"content": "# Test Slash Command Loading Behavior\n\nThis command has a UNIQUE_MARKER_12345...", "isMeta": true}

3. Claude responds to the content
```

### Skill Loading Flow

When user types `/vscode-server:status`:

```
1. System creates command-message (same as above)

2. System creates "Invoke: Skill(...)" instruction

3. Skill tool returns "Launching skill: vscode-server:status" (NO CONTENT)

4. Claude uses Read tool to fetch the skill file

5. Read tool result contains FULL CONTENT
```

### Evidence: Session Transcript

Single invocation session (c8ed5d2a):

```json
Line 1: {"type":"queue-operation"}
Line 2: {"type":"user","content":"<command-message>test-slash-loading</command-message>..."}
Line 3: {"type":"user","content":"# Test Slash Command Loading Behavior\n\nThis command has a UNIQUE_MARKER_12345...","isMeta":true}
Line 4: {"type":"assistant","content":"TEST_ACK_OK: UNIQUE_MARKER_12345"}
```

**Key observation**: Line 3 contains the FULL command content as a user message.

### Evidence: Debug Log

From debug log showing message creation:

```
processPromptSlashCommand creating 4 messages for vscode-server:status
Message 1: <command-message>vscode-server:status</command-message>
Message 2 [META]: [{"type":"text","text":"Invoke: Skill(...)"}]
Message 3: [ATTACHMENT]
Message 4: [ATTACHMENT]
```

## Multi-Invocation Test

### Test Script

Run this in a **fresh terminal** (not from within Claude):

```bash
#!/bin/bash
cd /Users/jason/ws/jdillon/vscode-beads

# Create session with 3 invocations
echo "=== Invocation 1 ==="
claude -p "/test-slash-loading"

echo "=== Middle prompt ==="
claude -c -p "Say MIDDLE_OK"

echo "=== Invocation 2 ==="
claude -c -p "/test-slash-loading"

echo "=== Invocation 3 ==="
claude -c -p "/test-slash-loading"

# Analyze
NEWEST=$(ls -t ~/.claude/projects/-Users-jason-ws-jdillon-vscode-beads/*.jsonl | grep -v agent | head -1)
echo ""
echo "=== Results ==="
echo "Session: $NEWEST"
echo "UNIQUE_MARKER count: $(grep -c 'UNIQUE_MARKER_12345' "$NEWEST")"
echo "Command invocations: $(grep -c '<command-message>test-slash-loading' "$NEWEST")"
```

### Expected Results

For 3 invocations of `/test-slash-loading`:
- `UNIQUE_MARKER_12345` should appear **3 times** (once per invocation)
- Each appearance is a separate user message with `isMeta: true`

## Implications

1. **Context Window Growth**: Each slash command invocation adds the full content to context
2. **No Caching**: Content is not cached or deduplicated
3. **Cost**: Repeated invocations of large commands consume tokens each time
4. **Design Consideration**: Keep command files concise; move detailed docs elsewhere

## Gotchas When Testing

### Running from Within Claude Session

When running `claude -p` from within an existing Claude session:
- Output may not display (captured as Bash tool result)
- `-c` continues the CURRENT session, not a fresh one
- Use explicit `--session-id` to force new session

### Session Affinity

Claude Code maintains session affinity per project directory. The "most recent" session (`-c`) is determined by file modification time in the project's session directory.

### Stream JSON Format

Using `--input-format stream-json` requires specific message format:
```json
{"type":"user","content":"/test-slash-loading"}
```
And requires `--verbose` flag with `--output-format stream-json`.

## Command → Skill Delegation Pattern

The vscode-server implementation uses thin command stubs that delegate to skills:

```
.claude/commands/vscode-server/start.md (153 bytes):
---
description: Start code-server dev environment (project)
allowed-tools: Skill(vscode-server)
---

Invoke: Skill(skill="vscode-server", args="start")
```

```
.claude/skills/vscode-server/start.md (1613 bytes):
[Actual implementation with instructions]
```

### How This Works

1. User types `/vscode-server:start`
2. Command content loaded as `isMeta: true` user message (~150 bytes)
3. Claude sees "Invoke: Skill(...)" instruction
4. Claude calls Skill tool → Returns "Launching skill..."
5. Claude reads skill file with Read tool → Full content loaded
6. **Total context impact**: Command stub + Skill content

### Optimization Opportunities

**Current pattern** (command + skill):
- Command: ~150 bytes (overhead)
- Skill: Full content via Read tool
- Total: Both appear in context

**Potential optimization** - Make command contain ONLY the Invoke instruction:
```
---
description: Start code-server
allowed-tools: Skill(vscode-server)
---
Invoke: Skill(skill="vscode-server", args="start")
```

No extra content = minimal overhead before skill takes over.

## Test Methodology: Running Claude in Sub-Shell

### Challenge

Running `claude -p` from within an existing Claude session has issues:
- Output may not display (captured as Bash tool result)
- `-c` continues the CURRENT session
- Session affinity per project directory

### Solution: External Test Script

Create test scripts to run in a **separate terminal**:

```bash
#!/bin/bash
# test-slash-interaction.sh - Run outside of Claude

cd /path/to/project

# Create unique marker
MARKER="TEST_$(date +%s)"

# Run test
claude -p "/your-command -- $MARKER"

# Find session
SESSION=$(grep -l "$MARKER" ~/.claude/projects/.../*.jsonl | head -1)

# Analyze
echo "Marker count: $(grep -c 'YOUR_MARKER' "$SESSION")"
cat "$SESSION" | jq -c '{type, isMeta, content_preview}'
```

### Key Transcript Fields

| Field | Purpose |
|-------|---------|
| `type` | `user`, `assistant`, `queue-operation` |
| `isMeta` | `true` for injected command content |
| `message.content` | Actual text/tool calls |
| `toolUseResult` | Result of tool execution |

## Direct Skill Invocation Test

**Question**: Can skills be invoked directly without command stubs?

**Test**: Created `.claude/skills/test-direct/` with SKILL.md and ping.md, NO corresponding `.claude/commands/test-direct/`.

**Result**: `Skill("test-direct", args="ping")` → **"Unknown skill: test-direct"**

**Conclusion**: Skills require command stubs to be discoverable. The command stub serves as the registration mechanism that makes a skill visible to the Skill tool.

### Why Command Stubs Are Required

```
.claude/commands/vscode-server/status.md  ← Registration (makes skill discoverable)
     ↓
     Invoke: Skill(skill="vscode-server", args="status")
     ↓
.claude/skills/vscode-server/status.md    ← Implementation (actual instructions)
```

Without the command stub, the skill exists on disk but isn't registered in the available skills list.

### Optimal Command Stub Pattern

Keep command stubs minimal - just the frontmatter and Invoke instruction:

```markdown
---
description: Brief description (project)
allowed-tools: Skill(skill-name)
---

Invoke: Skill(skill="skill-name", args="action")
```

This adds ~150 bytes of overhead per invocation, which is negligible compared to full command content.

## Files

- Session transcripts: `~/.claude/projects/-Users-jason-ws-jdillon-vscode-beads/*.jsonl`
- Debug logs: `~/.claude/debug/<session-id>.txt`
- This report: `sandbox/slash-command-loading-analysis.md`
