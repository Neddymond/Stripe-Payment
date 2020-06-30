"user strict"

const config = require("./config");
console.log(config.stripe);
const stripe = require("stripe")(config.stripe.secretKey);

const products = [
    {
        id: "hood",
        name: "Obey Hood",
        price: 2000,
        attributes: {size: "large", gender: "Unisex"}
    },
    {
        id: "toy",
        name: "Teddy Bear",
        price: 1500,
        attributes: {size: "large", color: "pink"}
    },
    {
        id: "shoe",
        name: "stripo EVO",
        price: 5000,
        attributes: {size: "45", gender: "Man"}
    },
    {
        id: "book",
        name: "Deep Work",
        price: 1889,
        attributes: {author: "Cal Newport", pages: "260"},
    },
    {
        id: "lipstick",
        name: "Rouge Pur Couture",
        price: 800,
        attributes: {color: "Red", brand: "YSL"}
    }
];

/** creates a collection pf stripe products and SKUs to use in your storefront */
const createStoreProducts = async () => {
    try {
        const stripeProducts = await Promise.all(
            products.map(async (product) => {
                const stripeProduct = await stripe.products.create({
                    id: product.id,
                    name: product.name,
                    type: "good",
                    attributes: Object.keys(product.attributes),
                    metadata: product.metadata
                });

                const stripeSku = await stripe.skus.create({
                    product: stripeProduct.id,
                    price: product.price,
                    currency: config.currency,
                    attributes: product.attributes,
                    inventory: {type: "infinite"}
                });

                return {stripeProduct, stripeSku};
            })
        );

        console.log(`🛍️ Successfully created ${stripeProducts.length} on your stripe account.`);
    } catch (err) {
        console.log(`⚠️ Error: ${err.message}`);
    }
};

createStoreProducts();
