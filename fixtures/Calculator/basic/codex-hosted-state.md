# Calculator Basic Fixture: Codex-Hosted State

Date: 2026-06-12

Source: `mcp__computer_use.get_app_state({"app":"Calculator"})` after restarting
the Codex app and enabling macOS Screen Recording plus Accessibility.

## Result

The Codex-hosted Computer Use path returned a successful state payload.

Header:

```text
Computer Use state (CUA App Version: 809)
```

App metadata:

```text
App=/System/Applications/Calculator.app/
bundleID com.apple.calculator
pid 61423
Window: "计算器", App: 计算器.
```

Focused element:

```text
The focused UI element is 7 滚动区 Description: 输入, ID: StandardInputView
```

Observed tree shape:

```text
0 标准窗口 计算器, ID: main, Secondary Actions: Raise
  1 分离组 main, SidebarNavigationSplitView
    2 分离器 (disabled, settable, float) -1
    3 container CalculatorKeypadView
      4 container
        5 滚动区 Description: 结果, ID: StandardResultView
          6 文本 ‎60‎×‎0.043‎×‎24
        7 滚动区 Description: 输入, ID: StandardInputView
          8 文本 ‎61.92
      9 按钮 Description: 全部清除, ID: AllClear
      10 按钮 Description: 更改正负号, Help: 更改数值符号, ID: Negate
      11 按钮 Description: 百分比, ID: Percent
      12 按钮 Description: 除, ID: Divide
      13 按钮 Description: 7, ID: Seven
      14 按钮 Description: 8, ID: Eight
      15 按钮 Description: 9, ID: Nine
      16 按钮 Description: 乘, ID: Multiply
      17 按钮 Description: 4, ID: Four
      18 按钮 Description: 5, ID: Five
      19 按钮 Description: 6, ID: Six
      20 按钮 Description: 减, ID: Subtract
      21 按钮 Description: 1, ID: One
      22 按钮 Description: 2, ID: Two
      23 按钮 Description: 3, ID: Three
      24 按钮 Description: 加, ID: Add
      25 按钮 Description: 0, ID: Zero
      26 按钮 Description: 点, ID: Decimal
      27 按钮 Description: 等于, ID: Equals
      28 container Description: 更改模式, ID: Mode: basic; unitConversion: false
        29 菜单按钮 Description: calculator.fill, Help: 更改计算器模式
  30 关闭按钮
  31 缩放按钮 (disabled)
  32 最小化按钮
33 menu bar
  34 计算器
  35 编辑
  36 显示
  37 窗口
  38 帮助
```

## State Model Observations

- The hosted tool returns a human-readable `app_state` block rather than raw JSON
  in the Codex transcript.
- Element indexes are decimal path-local identifiers such as `9`, `21`, and
  `27`.
- Nodes include localized role names, descriptions, IDs, disabled/settable
  flags, help text, and secondary actions.
- The response includes a screenshot rendered as image content in the Codex UI.
- Calculator button IDs are semantic and stable-looking, such as `AllClear`,
  `One`, `Add`, and `Equals`.
- Text values are included as child text nodes under result/input scroll areas.

## Direct MCP Difference

The direct stdio probe still times out after auto-accepting the app approval
elicitation. Therefore, for Milestone 4, the Codex-hosted Computer Use response
is currently the usable oracle for successful state payload shape.

## Action Recheck

In the original reverse-engineering thread, `list_apps` and `get_app_state`
recovered after restarting Codex, but action tools such as `click`,
`press_key`, and `perform_secondary_action` continued to return:

```text
Computer Use is not active for 'Calculator'
```

The user confirmed that Calculator actions work normally through Computer Use in
a new chat. A later hosted Calculator smoke test in this project thread also
successfully clicked `9`, `×`, `9`, and `=`, producing `81`. This confirms the
old action failure was stale session state rather than a global Computer Use
permission or service failure.
