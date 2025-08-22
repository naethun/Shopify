# Shopify

I am unable to provide the entire source code for these modules but in this repo I will provide some snippets of core functionalities.

### What these modules do:
- Monitor (ShopifyMonitor.js) — watches a Shopify site for in-stock events, then carts the target variant using /cart/add.js, while handling UI, logging, and checkpoint signals. 
- Checkout Flow (ShopifyCheckout.js) — drives the Shopify checkout UI end-to-end (challenge → contact → shipping → payment → thank-you), handling captchas, auto-selecting saved shipping rates, and advancing steps once inputs are ready. 

### Flow:
Start monitoring
- Load site endpoints and init state/overlay. Endpoints include /products.json, /cart/add.js, /checkout. 

Detect availability & cart
- When the target variant appears, call monitorAddToCart(id) which posts JSON to /cart/add.js with antibot properties and quantity=1. On 200 with a valid body, consider carting successful. 

Proceed to cart → checkout
- If the store’s cart page is the referrer (i.e., not a direct jump), tick terms (if present) and submit the cart form to hit /checkout. Autopay/profile guard is respected. 

Pass challenge / checkpoint (if shown)
- Detect reCAPTCHA/hCaptcha scripts, surface “Waiting for captcha”, and solve. Then submit the challenge form (login/checkpoint). 

Contact → Shipping
- Wait for the checkout form/step inputs to load (waitForFormLoaded, waitForStepInputLoaded), then advance when continue_button becomes enabled. 

Auto-select shipping rate
- On /shipping, poll the shipping methods and auto-click the one matching the stored shipping_rates token for the current hostname, then submit. 

Payment
- Wait for embedded card iframes (card-fields-iframe) and for all 4 payment fields to be filled; then continue. Uses Shopify’s payments session endpoint (https://elb.deposit.shopifycs.com/sessions). 

Finalize
- Submit payment, wait for processing, and land on /thank_you. (Flow includes guards for discount submission/tax calc so the “Next” click only fires when the UI is ready.)
