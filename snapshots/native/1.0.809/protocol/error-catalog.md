# MCP Error Catalog

Generated: 2026-06-12T08:50:27.843Z

This catalog records read-only or intentionally invalid probes. Valid action
tool behavior is deferred to later fixture milestones.

## list_apps: invalid_params

Request params: `{"name":"list_apps","arguments":{"__computer_use_probe_invalid_argument__":true}}`

Probe error: Timed out waiting for response id 10

## list_apps: minimal_read_only

Request params: `{"name":"list_apps","arguments":{}}`

Probe error: Timed out waiting for response id 10

## get_app_state: missing_required

Request params: `{"name":"get_app_state","arguments":{}}`

Tool result error: [{"text":"Missing required argument: app","type":"text"}]

## get_app_state: invalid_params

Request params: `{"name":"get_app_state","arguments":{"app":12345}}`

Tool result error: [{"text":"Missing required argument: app","type":"text"}]

## click: missing_required

Request params: `{"name":"click","arguments":{}}`

Tool result error: [{"text":"Missing required argument: app","type":"text"}]

## click: invalid_params

Request params: `{"name":"click","arguments":{"app":12345}}`

Tool result error: [{"text":"Missing required argument: app","type":"text"}]

## perform_secondary_action: missing_required

Request params: `{"name":"perform_secondary_action","arguments":{}}`

Tool result error: [{"text":"Missing required argument: app","type":"text"}]

## perform_secondary_action: invalid_params

Request params: `{"name":"perform_secondary_action","arguments":{"app":12345,"element_index":12345,"action":12345}}`

Tool result error: [{"text":"Missing required argument: app","type":"text"}]

## set_value: missing_required

Request params: `{"name":"set_value","arguments":{}}`

Tool result error: [{"text":"Missing required argument: app","type":"text"}]

## set_value: invalid_params

Request params: `{"name":"set_value","arguments":{"app":12345,"element_index":12345,"value":12345}}`

Tool result error: [{"text":"Missing required argument: app","type":"text"}]

## select_text: missing_required

Request params: `{"name":"select_text","arguments":{}}`

Tool result error: [{"text":"Missing required argument: app","type":"text"}]

## select_text: invalid_params

Request params: `{"name":"select_text","arguments":{"app":12345,"element_index":12345,"text":12345}}`

Tool result error: [{"text":"Missing required argument: app","type":"text"}]

## scroll: missing_required

Request params: `{"name":"scroll","arguments":{}}`

Tool result error: [{"text":"Missing required argument: app","type":"text"}]

## scroll: invalid_params

Request params: `{"name":"scroll","arguments":{"app":12345,"element_index":12345,"direction":12345}}`

Tool result error: [{"text":"Missing required argument: app","type":"text"}]

## drag: missing_required

Request params: `{"name":"drag","arguments":{}}`

Tool result error: [{"text":"Missing required argument: app","type":"text"}]

## drag: invalid_params

Request params: `{"name":"drag","arguments":{"app":12345,"from_x":12345,"from_y":12345,"to_x":12345,"to_y":12345}}`

Tool result error: [{"text":"Missing required argument: app","type":"text"}]

## press_key: missing_required

Request params: `{"name":"press_key","arguments":{}}`

Tool result error: [{"text":"Missing required argument: app","type":"text"}]

## press_key: invalid_params

Request params: `{"name":"press_key","arguments":{"app":12345,"key":12345}}`

Tool result error: [{"text":"Missing required argument: app","type":"text"}]

## type_text: missing_required

Request params: `{"name":"type_text","arguments":{}}`

Tool result error: [{"text":"Missing required argument: app","type":"text"}]

## type_text: invalid_params

Request params: `{"name":"type_text","arguments":{"app":12345,"text":12345}}`

Tool result error: [{"text":"Missing required argument: app","type":"text"}]

## __computer_use_probe_missing_tool__: invalid_tool_name

Request params: `{"name":"__computer_use_probe_missing_tool__","arguments":{}}`

Tool result error: [{"text":"Unknown tool: __computer_use_probe_missing_tool__","type":"text"}]
