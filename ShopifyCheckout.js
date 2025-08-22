/*
1) Out-of-stock → autonomous restock monitor (GraphQL hinting + products.json scan)
Purpose: when Shopify shows stock_problems, flip into a self-healing polling loop that identifies the product page/set, targets preferred sizes, and instantly recovers to ATC.
*/
const checkForStockNEWForC = async (profile) => {
  try { 
    document.querySelector('h2').innerHTML = "OUT OF STOCK... LIGHTNING IS MONITORING (DO NOT REFRESH)"; 
  } catch (e) {
    console.log(e)
  }

  // (Optional) parse serialized GraphQL hints to narrow variant/ids
  let graphqlElem = document.querySelector('div[data-serialized-id="graphql"]') || document.querySelector('div[data-serialized-id="graphql-queries"]');
  // ...extract product/variant ids if present (omitted for brevity)

  abortController = new AbortController();
  setInterval(async () => {
    if (!run) return;
    const url = `https://${window.location.hostname}/products.json?limit=${Date.now()}`;
    const res = await fetch(url, { 
      headers: { 'Accept': 'application/javascript' }, 
      credentials: 'same-origin', 
      signal: abortController.signal 
    });
    
    if (!res || res.status !== 200) return;

    const items = await res.json();
    let variant;
    for (const p of items.products) {
      // 1) any in-stock (first-available/random)
      const any = p.variants.find(v => v.available === true);
      // 2) or prefer targeted sizes from profile (shoe/clothing)
      // (search over option1/option2 against profile preferences)
      // ...
      if (any) { 
        variant = any.id; 
        break; 
      }
    }

    if (variant !== undefined) {
      run = false;
      await clearCartc();                       // atomic cart hygiene
      
      const prod = await monitorAddToCart(variant);
      if (prod) {
        const response = await goToCheckoutMonitorOOs(window.location.hostname);
        window.location.href = response.url;    // handoff to queue/checkout
      }
    }
  }, delayFromMonitor);
};



/*
2) DOM-agnostic “next step” orchestration (MutationObserver gating)
Purpose: advance checkout only when Shopify enables the button (no timeouts), with a fallback to the generic Form submit path.
*/

const checkNextButtonEnabledNew = (form = null, cb) => {
  let query = 'button[type="submit"]:not([disabled])';
  if (!form) form = document; query = 'form[id^="Form"] ' + query;

  const btn = form.querySelector(query);
  if (btn) return cb();

  const obs = new MutationObserver((_m, self) => {
    const b = document.querySelector(query);
    if (!b) return;
    self.disconnect(); 
    cb();
  });
  
  obs.observe(document, { 
    childList: true, 
    subtree: true 
  });
};

const waitForNextEnabledNew = async (form = null) =>
  new Promise(resolve => checkNextButtonEnabledNew(form, resolve));

const clickNextNew = async (force = false) => {
  const btn = document.querySelector('form[id^="Form"] button[type="submit"]');
  if (!btn) return;
  if (force) btn.removeAttribute('disabled');
  btn.focus(); btn.click();
};




/*
3) Headless “wait → solve → submit” captcha gate (non-blocking UX, safe retries)
Purpose: detect hCaptcha/reCAPTCHA, visually gate the CTA, request a token via your solver bridge, and only then re-enable/submission—without freezing the UI.
*/

const hasCaptcha = () => {
  const googleScript = document.querySelector('script[src^="https://www.recaptcha.net/recaptcha/"]');
  const hcaptchaScript = document.querySelector('script[src^="https://www.hcaptcha.com/"], script[src^="https://hcaptcha.com/"]');
  return googleScript != null || hcaptchaScript != null;
};

const solveCaptcha = () => {
  try {
    const obs = new MutationObserver((mutations, self) => {
      const frame = document.querySelector('iframe[title="reCAPTCHA"]');
      if (!frame) return;
      self.disconnect();

      const sitekey = new URL(frame.src).searchParams.get('k');
      chrome.runtime.sendMessage({ 
        type: "Solve_captcha", 
        item: { sitekey, siteURL: window.location.href } 
      });
    });

    obs.observe(document, { childList: true, subtree: true });
  } catch (e) { /* log */ }
};

const waitForCaptcha = async () => {
  if (!hasCaptcha()) return;
  let btn = document.querySelector('#continue_button, button[name="commit"], input.shopify-challenge__button');
  if (btn) btn.disabled = 'true';

  await solveCaptcha();
  await checkCaptchaResponse();               // polls until token present
  await sleepShopifyyFlow(CAPTCHA_SUBMIT_DELAY_MS);

  btn = document.querySelector('#continue_button, button[name="commit"], input.shopify-challenge__button');
  if (btn) { 
    btn.removeAttribute('disabled'); 
    btn.click?.();
  }
};


/*
5) Atomic cart hygiene + request-level ATC (no stale state)
Purpose: enforce a clean cart before ATC, and use the /cart/add.js JSON endpoint for a verifiable add—then only proceed if payload is valid.
*/

const clearCartc = async () => fetch(PATHSc.CART_CLEAR, { 
  method:'POST', 
  redirect:'follow', 
  credentials:'same-origin' 
});

const monitorAddToCart = async (variantId) => {
  const properties = await getAntibotProperties();
  const body = { form_type:'product', utf_8:'✓', quantity:1, id:String(variantId), properties };
  const res = await fetch('/cart/add.js', {
    method:'POST', 
    headers:{ 
      'X-Requested-With':'XMLHttpRequest', 
      'Content-Type':'application/json' 
    },
    credentials:'same-origin', 
    body: JSON.stringify(body),
  });

  if (!res || !res.ok) return null;

  const json = await res.json();
  if (!json.product_title) return null;
  return { 
    product:{ title: json.product_title }, 
    variant:{ id: variantId } 
  };
};



