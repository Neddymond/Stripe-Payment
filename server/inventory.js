"use strict"

const config = require("./config");
const stripe = require("stripe")(config.stripe.secretKey);

/** list all products */
const listProducts = async () => {
    return await stripe.products.list({limit: 5, type: "good"});
};

/** Retrieve a project by ID */
const retrieveProduct = async (productId) => {
    return await stripe.products.retrieve(productId);
};

/** Get shipping cost from config based on selected shipping option */
const getShippingCost = (shippingOption) => {
    return config.shippingOptions.filter((sOption) => sOption.id === shippingOption)[0].amount;
};

exports.products = {
    list: listProducts,
    retrieve: retrieveProduct,
    getShippingCost
};