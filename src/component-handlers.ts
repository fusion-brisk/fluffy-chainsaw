/**
 * Component Handlers - точка входа для всех обработчиков компонентов
 * 
 * Модули:
 * - label-handlers.ts — Brand, ELabelGroup, EPriceBarometer, EMarketCheckoutLabel
 * - button-handlers.ts — EButton, MarketCheckoutButton
 * - snippet-handlers.ts — ESnippet fallbacks, ShopInfo, OfficialShop, EOfferItem
 * - delivery-handlers.ts — EDeliveryGroup, ShopInfoBnpl, ShopInfoDeliveryBnplContainer
 * - price-handlers.ts — EPriceGroup, EPrice, LabelDiscount
 */

// Re-export types
export type { HandlerContext } from './handlers/types';

// Re-export from label-handlers
export {
  handleBrandLogic,
  handleELabelGroup,
  handleEPriceBarometer,
  handleEMarketCheckoutLabel
} from './handlers/label-handlers';

// Re-export from button-handlers
export {
  handleMarketCheckoutButton,
  handleEButton
} from './handlers/button-handlers';

// Re-export from snippet-handlers
export {
  handleESnippetOrganicTextFallback,
  handleESnippetOrganicHostFromFavicon,
  handleShopInfoUgcAndEReviewsShopText,
  handleOfficialShop,
  handleEOfferItem
} from './handlers/snippet-handlers';

// Re-export from delivery-handlers
export {
  handleEDeliveryGroup,
  handleShopInfoBnpl,
  handleShopInfoDeliveryBnplContainer
} from './handlers/delivery-handlers';

// Re-export from price-handlers
export {
  handleEPriceGroup,
  handleEPriceView,
  handleLabelDiscountView
} from './handlers/price-handlers';
