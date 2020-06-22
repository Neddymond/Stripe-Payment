"user strict"

const config = require("./config");
const stripe = require("stripe")(config.stripe.secretKey);

const products = [
    {
        id: "Hood",
        name: "Hood",
        price: 999,
        attributes: {}
    },
    {
        id: "toy",
        name: "Teddy Bear",
        price: 999,
        attributes: {}
    },
    {
        id: "shoe",
        name: "",
        price: 999,
        attributes: {size: "", gender: ""}
    },
    {
        id: "book",
        name: "Deep Work",
        price: 999,
        attributes: {author: "Cal Newport", pages: ""},
    },
    {
        id: "lipstick",
        name: "",
        price: 999,
        attributes: ""
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
                    inventory: {type: "infinte"}
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
