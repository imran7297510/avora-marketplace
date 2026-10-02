# Project Guidelines & Persistent Rules

## Global Marketplace Architecture
- **Worldwide Scope**: The platform is a worldwide, multi-currency marketplace open to users, sellers, and buyers across all countries. It is NOT restricted only to Pakistan.
- **Universal Multi-Currency Support**:
  - Support all world currencies (USD, EUR, GBP, PKR, INR, AED, SAR, CAD, AUD, JPY, CNY, etc.) across listings, Battle Bids live auctions, bids, and buyer-seller negotiations.
  - Form inputs, auction creation, negotiation offers/counteroffers, and bidding displays must dynamically adapt to the listing's or user's selected country and currency.
  - Never hardcode country-exclusive restrictions or assume all transactions are in PKR or located in Pakistan.
- **Battle Bids & Negotiations**:
  - Combatants, bidders, and negotiators can participate globally with their local or listing-specific currencies and proper currency symbols/codes.
  - All formatters (`formatPrice`, `getCurrencyByCode`, `CurrencySelector`) must preserve and respect the item's configured currency.
