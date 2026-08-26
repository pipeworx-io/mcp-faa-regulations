# mcp-faa-regulations

FAA Regulations MCP — US Federal Aviation Regulations (14 CFR, "FARs").

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1476+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `faa_regulation` | Get the full text of one Federal Aviation Regulation (FAR) — a US FAA / aviation regulation codified in 14 CFR — by its citation. Returns the exact regulatory wording currently in force. Answers "what does FAR 91.113 say", "what is the FAA regulation for X", "does the FAA require X", "read 14 CFR 107.29", "the FAA right-of-way rule". Forgiving citation input: "91.113", "14 CFR 91.113", "FAR 91.113", "§91.113", even "91.113(b)" (paragraph stripped to the section). Covers 14 CFR part 91 general operating & flight rules, part 121 airline/scheduled operations, part 135 commuter & on-demand, part 107 small unmanned aircraft (drone) rules, part 61 pilot/airman certification, part 43 maintenance, part 145 repair stations, part 25 aircraft airworthiness — the whole of Title 14 (aviation, aircraft, airspace, pilots). Pass a whole part (e.g. "91" or "107") to get that part's section list. Example: faa_regulation({ citation: "91.113" }) -> right-of-way rules; faa_regulation({ citation: "FAR 107.29" }) -> drone operation at night. Keyless. |
| `faa_search` | Keyword search across the Federal Aviation Regulations — US FAA / aviation rules in 14 CFR. Answers "what FAA regulations cover X", "the aviation rule / FAR about X", "find the FAA regulation for X". Great for topics: right-of-way, VFR/IFR flight rules, minimum safe altitudes, drone / small unmanned aircraft operations, remote pilot certification, airline operating requirements, pilot certification and medical, aircraft airworthiness, maintenance and repair stations, airspace, TFRs. Returns matching Federal Aviation Regulations with citation (14 CFR / FAR), heading, excerpt, and source URL. Note: the CFR text uses "unmanned aircraft", not "drone" — search "unmanned aircraft night" for drone-at-night rules. Example: faa_search({ query: "unmanned aircraft night" }); faa_search({ query: "right-of-way rules", limit: 15 }). Keyless. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "faa-regulations": {
      "url": "https://gateway.pipeworx.io/faa-regulations/mcp"
    }
  }
}
```

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/faa-regulations/mcp` returns the tools in the table
above **plus the shared Pipeworx meta-tools** — `ask_pipeworx`,
`discover_tools`, `search_within`, `remember`/`recall` and the rest of the
gateway-wide set. So the tool count you see is larger than this table: a
single-pack endpoint currently lists roughly 30 shared tools alongside the
pack's own. The connection's `initialize` response states its exact scope, and
is the authoritative answer for a given day.

This is deliberate, not multiplexing by accident. The meta-tools are what let a
scoped connection answer a question this pack does not cover — via
`ask_pipeworx`, which routes across the whole catalog — without you adding a
second MCP server. There is currently no way to mount a pack endpoint without
them; if the extra schemas cost you more context than the routing is worth,
connect to the full gateway once rather than to several pack endpoints.

Or connect to the full Pipeworx gateway to get every pack's tools listed
directly, instead of just this one's:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

Both URLs reach the same gateway and the same 1476+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about Faa Regulations data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
