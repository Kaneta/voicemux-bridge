# VoiceMux Community Adapters Catalog 📂

Copy the JSON snippets below and paste them into the **Custom Site Adapters** field in your VoiceMux Extension Options.

---

### 📧 Outlook (Web)
Supports both personal (outlook.com) and business (Office 365).
```json
{
  "id": "outlook",
  "name": "Outlook",
  "host": "outlook",
  "inputSelector": "div[role='textbox'][aria-label*='メッセージ'], div[role='textbox'][aria-label*='Message']",
  "submitSelector": null
}
```

### 📧 Yahoo! Mail (Japan)
```json
{
  "id": "yahoo-mail-jp",
  "name": "Yahoo! Mail JP",
  "host": "mail.yahoo.co.jp",
  "inputSelector": "div[role='textbox']",
  "submitSelector": null
}
```

### 💬 Slack (Web)
```json
{
  "id": "slack",
  "name": "Slack",
  "host": "slack.com",
  "inputSelector": ".ql-editor",
  "submitSelector": "button[data-testid='composer_send_button']"
}
```

### 📝 Notion
```json
{
  "id": "notion",
  "name": "Notion",
  "host": "notion.so",
  "inputSelector": "div[contenteditable='true']",
  "submitSelector": null
}
```

---

### 💡 How to contribute
If you've created a working adapter for a new site, please open a Pull Request or Issue to add it to this list!
