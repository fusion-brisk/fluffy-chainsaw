# Contentify - Remote Configuration

This directory contains remote configuration files for the Contentify Figma plugin.

## 📄 Files

### `parsing-rules.json`

Parsing rules for extracting data from HTML/MHTML files (Yandex search results).

**Raw URL:**
```
https://raw.githubusercontent.com/shchuchkin/fluffy-chainsaw/main/config/parsing-rules.json
```

This URL is used by the plugin to automatically fetch updates.

## 🔄 Update Workflow

1. Edit `parsing-rules.json`
2. Increment `version` field
3. Commit and push to GitHub
4. Plugin users will see update prompt on next startup

## 📋 Structure

```json
{
  "version": 1,
  "rules": {
    "#FieldName": {
      "domSelectors": ["CSS", "selectors"],
      "jsonKeys": ["json", "keys"],
      "type": "text|image|price|html|attribute|boolean",
      "domAttribute": "optional attribute"
    }
  }
}
```

## 📚 Documentation

- [Remote Config Guide](../docs/REMOTE_CONFIG_GUIDE.md)
- [Example with Comments](../docs/parsing-rules-example.json)
- [Plugin Documentation](../README.md)

## ⚠️ Important

- Always validate JSON before committing
- Increment version to trigger updates
- Test changes before pushing to main branch

