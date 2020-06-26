class Store {
  constructor() {
    this.lineItems = [];
    this.products = {};
    this.productsFetchPromise = null;
    this.displayPaymentSummary();
  }

  /** compute the total for the payment based on the line items (SKUs and quantity)  */
  getPaymentTotal() {
    return Object.values(this.lineItems).reduce((total, { product, sku, quantity }) => total + quantity * this.products[product].skus.data[0].price, 0);
  };

  /** Expose the line items for the payment using products and skus stored in stripe */
  getLineItems() {
    let items = [];

    this.lineItems.forEach((item) => 
      items.push({
        type: "sku",
        parent: item.sku,
        quantity: item.quantity
      })
    );

    return items;
  };

  /** Retrieve the configuration from the API */
  async getConfig() {
    try {
      const response = await fetch("/config");
      const config = await response.json();

      if (config.stripePublishableKey.includes("live")) {
        // Hide the demo notice if the publishable key is in live mode.
        document.querySelector("#order-total .demo").style.display = "none";
      }

      return config;
    } catch (err) {
      return { error: err.message };
    }
  };

  /** Load the product details. */
  LoadProducts() {
    if (!this.productsFetchPromise) {
      this.productsFetchPromise = new Promise(async (resolve) => {
        const productsResponse = await fetch("/products");
        const products = (await productsResponse.json()).data;

        if (!products.length) {
          throw new Error("No products on Stripe account! Make sure the setup has run properly.");
        }

        // Check if we have SKUs on the product, otherwise load them seperately.
        for (const product of products) {
          this.products[product.id] = product;
          if (!product.skus) {
            await this.loadSkus(product.id);
          }
        }
        resolve();
      });
    }
    return this.productsFetchPromise;
  };

  /** Create the PaymentIntent with the cart details */
  async createPaymentIntent(currency, items) {
    try {
      const response = await fetch("/payment_intents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency, items })
      });

      const data = await response.json();
      if(data.error) {
        return { error: data.error };
      } else {
        return data;
      }
    } catch (err) {
      return { error: err.message };
    }
  };


}