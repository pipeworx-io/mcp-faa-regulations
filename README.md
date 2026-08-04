# mcp-faa-regulations

FAA Regulations MCP — US Federal Aviation Regulations (14 CFR, "FARs").

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

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

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Faa Regulations data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
