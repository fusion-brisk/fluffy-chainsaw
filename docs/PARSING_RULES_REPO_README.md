# Contentify - Parsing Rules Configuration

> Remote configuration for [Contentify Figma Plugin](https://github.com/fusion-brisk/fluffy-chainsaw)

## 📋 Overview

This repository contains parsing rules for the **Contentify** Figma plugin, which automatically fills design layouts with data from HTML/MHTML files (Yandex search results parsing).

## 🚀 Usage

### In Contentify Plugin:

1. Open plugin in Figma
2. Navigate to **Settings** section
3. Enter this repository's raw URL:
   ```
   https://raw.githubusercontent.com/fusion-brisk/fluffy-chainsaw/main/config/parsing-rules.json
   ```
4. Plugin will automatically check for updates on startup

### Update Workflow:

1. Edit `parsing-rules.json` in this repository
2. Increment `version` field
3. Commit and push changes
4. Plugin users will see update prompt on next startup

## 📄 File Structure

```json
{
  "version": 1,
  "rules": {
    "#FieldName": {
      "domSelectors": ["CSS", "selectors"],
      "jsonKeys": ["json", "keys"],
      "type": "text|image|price|html|attribute|boolean",
      "domAttribute": "optional attribute name"
    }
  }
}
```

## 🔧 How It Works

### Merge Behavior

- **Remote rules override embedded rules**
- Missing fields fallback to embedded defaults
- Soft merge ensures plugin works even with partial config

### Update Process

1. Plugin loads cached rules on startup (or embedded fallback)
2. Background check for updates from this URL
3. If hash differs → shows update confirmation dialog
4. User can **Apply** (saves to cache) or **Dismiss**
5. Rules can be reset to defaults via UI

## 📝 Field Types

| Type | Description | Example Usage |
|------|-------------|---------------|
| `text` | Plain text content | Title, description |
| `image` | Image URL extraction | Product images |
| `price` | Price with formatting | Current price, old price |
| `html` | HTML content | Rich text |
| `attribute` | HTML attribute | href, src, data-* |
| `boolean` | Presence check | Element exists |

## 🎯 Supported Fields

### Product Information
- `#OrganicTitle` - Product title
- `#ShopName` - Shop/vendor name
- `#OrganicText` - Product description
- `#OrganicImage` - Product image
- `#ProductURL` - Product page URL

### Pricing
- `#OrganicPrice` - Current price
- `#OldPrice` - Original price
- `#DiscountPercent` - Discount percentage

### Ratings & Reviews
- `#ShopRating` - Shop rating
- `#ProductRating` - Product rating
- `#ReviewsNumber` - Reviews count

### Technical Fields
- `EPriceGroup_*` - Price group parsing
- `LabelDiscount_*` - Discount labels
- `EPriceBarometer` - Price comparison

## 🔄 Version History

### v1 (Current)
- Initial release with Yandex search results support
- Basic product fields
- Price and rating extraction

## 🐛 Troubleshooting

### Rules not updating?
1. Check URL is correct (raw GitHub URL)
2. Verify JSON is valid (use JSONLint)
3. Ensure `version` field is incremented
4. Check browser console for errors

### Plugin not working after update?
1. Open plugin Settings
2. Click **Reset to defaults** (🗑️ button)
3. Plugin will revert to embedded rules

## 📚 Documentation

- [Remote Config Guide](../REMOTE_CONFIG_GUIDE.md)
- [Plugin Documentation](../README.md)
- [Example Configuration](./parsing-rules-example.json)

## 🤝 Contributing

1. Fork this repository
2. Create feature branch (`git checkout -b feature/new-field`)
3. Edit `parsing-rules.json`
4. Test in Contentify plugin
5. Commit changes (`git commit -am 'Add new field'`)
6. Push to branch (`git push origin feature/new-field`)
7. Create Pull Request

## 📜 License

MIT License - see LICENSE file for details

## 🔗 Links

- [Contentify Plugin Repository](https://github.com/fusion-brisk/fluffy-chainsaw)
- [Figma Community](https://www.figma.com/community/plugin/...)
- [Report Issues](https://github.com/fusion-brisk/fluffy-chainsaw/issues)

---

**Note:** This configuration is automatically loaded by the Contentify plugin. Changes will be applied after user confirmation.

