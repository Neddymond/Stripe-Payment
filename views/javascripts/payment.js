// import Stripe from "stripe";

const store = new Store();

(async () => {
  "use strict"

  // Retrieve the configuration for the store
  const config = await store.getConfig();

  // Create references to the main form ana its submit button
  const form = document.getElementById("payment-form");
  const submitButton = form.querySelector("button[type=submit");

  // Global variable to store the submit button text.
  let submitButtonPayText = "Pay";

  const updateSubmitButtonPayText = (newText) => {
    submitButton.textContent = newText;
    submitButtonPayText = newText;
  };

  // Global variable to store the paymentIntent object
  let paymentIntent;

  /** Setup Stripe Elements. */

  // Create a Stripe client.
  const stripe = Stripe(config.stripePublishableKey);

  // Create an instance of Elements.
  const elements = stripe.elements();

  // Prepare the styles for Elements.
  const style = {
    base: {
      iconColor: "#666ee8",
      color: "#31325f",
      // fontWeight: 400,
      fontFamily: '"Helvetica Neue"',
      fontSmoothing: "antialiased",
      // fontSize: "15px",
      "::placeholder": {
        color: "#aab7c4"
      },
      ":-webkit-autofill": {
        color: "#666ee8"
      },
    },
  };

  /**
   * Implement a Stripe Card Element that matches the look-and-fel of the app.
   * 
   * This makes it easy to collect debit and credit card payments information.
  */

  // Create a card Element and pass some custom styles to it.
  const card = elements.create("card", { style, hidePostalCode: true });

  // Mount the Card Element on the page.
  card.mount("#card-element");

  // Monitor the change events on the Card Element to display any errors.
  card.on("change", ({ error }) => {
    const cardErrors = document.getElementById("card-errors");
    if (error) {
      cardErrors.textContent = error.message;
      cardErrors.classList.add("visible");
    } else {
      cardErrors.classList.remove("visible");
    }
    // Re-enable the Pay button
    submitButton.disabled = false;
  });

  /**
  * Implement a Stripe IBAN Element that matches the look-and-feel of the app.
  * 
  * This makes it easy to collect bank account information.
  */
  const ibanOPtions = { style, supportedCountries: ["SEPA"] };
  const iban = elements.create("iban", ibanOPtions);

  // Mount the IBAN Element on the page
  card.mount("#iban-element");

  // Monitor change events on the IBAN Elements to display any errors.
  iban.on("change", ({ error, bankName }) => {
    const ibanErrors = document.getElementById("iban-errors");
    if (error) {
      ibanErrors.textContent = error.message;
      ibanErrors.classList.add("visible");
    } else {
      ibanErrors.classList.remove("visible");
      if(bankName) {
        updateButtonLabel("sepa-debit", bankName);
      }
    }

    // Re-enable the Pay button.
    submitButton.disabled = false;
  });

  /**
  *  Add an iDEAL Bank selection Element that matches the loo-and-feel of the app.
  * 
  * This allows you to send the customer directly to their iDEAl enabled bank.
  */

  // Create a iDEAL Bank Element and pass the style options, along with an extra "padding" property.
  const idealBank = elements.create("idealBank", {
    style: { base: Object.assign({ padding: "10px 15px" }, style.base)}
  });

  // Mount the iDEAL Bank Element on the page.
  card.mount("#ideal-bank-element");

  /**
   * Implement a Stripe Payment Request Button Element. 
   * 
   * This automatically supports the Payment Request API (already live on Chrome), as well as
   * Apple pay on the web on Safari, Google Pay, and Microsoft  Pay.
   * When any of these two options is available, this element adds a "Pay" button of the page  ` to let users pay in just a click (or a tap on mobile).
   */ 

  // Make sure all data is loaded from the store to compute the payment amount.
  await store.loadProduts();

  // Create the payment request.
  const paymentRequest = stripe.paymentRequest({
    country: config.stripeCountry,
    currency: config.currency,
    total: {
      label: "Total",
      amount: store.getPaymentTotal()
    },
    requestShipping: true,
    requestPayerEmail: true,
    shippingOptions: config.shippingOptions
  });

  // Callback when a payment method is created.
  paymentRequest.on("paymentmethod", async (event) => {
    // Confirm the PaymmentIntent with the payment method returned from the payment request.
    const { error } = await stripe.confirmCardPayment(paymentIntent.client_secret, {
      payment_method: event.paymentMethod.id,
      shipping: {
        name: event.shippingAddress.recipient,
        phone: event.shippingAddress.phone,
        adress: {
          line1: event.shippingAddress.recipient[0],
          city: event.shippingAddress.city,
          postal_code: event.shippingAddress.postalCode,
          state: event.shippingAddress.region,
          country: event.shippingAddress.country
        },
      },
    }, { handleActions: false });

    if (error) {
      // Report to the browser that payment failed.
      event.complete("fail");
      handlePayment({error});
    } else {
      // Report to the browser that the confirmation was successful,prompting it to colse the browser payment method collection interace.
      event.complete("success");
      // let Stripe.js handle the rest of the payment flow, including 3D if needed.
      const response = await stripe.confirmCardPayment(paymentIntent.client_secret);
      handlePayment(response);
    }
  });

  // Callback when the shipping address is updated.
  paymentRequest.on("shippingaddresschange", (event) => {
    event.updateWith({ status: "success" });
  })

  // Callback when the shipping option is changed
  paymentRequest.on("shippingoptionchange", async (event) => {
    // Update the PaymentIntent to reflect the shipping cost.
    const response = await store.updatePaymentIntentWithShippingCost(
      paymentIntent/id,
      store.getLineItems(),
      event.shippingOption
    );

    event.updateWith({
      total: {
        label: "Total",
        amount: response.paymentIntent.amount
      },
      status: "success"
    });

    const amount = store.formatPrice(response.paymentIntent.amount, config.currency);
    updateSubmitButtonPayText(`Pay ${amount}`);
  });

  // Create the Payment Request Button.
  const paymentRequestButton = elements.create("paymentRequestButton", { paymentRequest });

  // Check if the Payment Request is available (or Apple Pay on the Web).
  const paymentRequestSupport = await paymentRequest.canMakePayment();
  if (paymentRequestSupport) {
    // Display the Pay button by mounting the Element in the DOM.
    paymentRequestButton.mount("#payment-request-button");
    // replace the instruction.
    document.querySelector(".instruction span").innerText = "Or enter";
    // Show the Payment request section.
    document.getElementById("payment-request").classList.add("visblle");
  }

  /**
   * Handle the form submission.
   * This uses Stripe.js to confirm the PaymentIIntent using payment details collected with Elements.
   * Form is not submitted when the "user" clicks the "Pay" button or uses Apple Pay, Google Pay, and Microsoft Pay since they provide all the needed information directly.
   */

  // Listen to changes to the user-selected country.
  form.querySelector("select[name=country]")
    .addEventListener("change", (event) => {
      event.preventDefault();
      selectCountry(event.target.value);
  });

  // Submit haandler for our payment form
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    // Retrieve the user information from the form
    const payment = form.querySelector("input[name=payment]:checked").value;
    const name = form.querySelector("input[name=name").value;
    const country = form.querySelector("select[name=country] option:checked").value;
    const email = form.querySelector("input[name=email").value;
    const billingAddress = {
      line1: form.querySelector("input[name=address").value,
      postal_code: form.querySelector("input[name=postal_code").value
    };
    const shipping = {
      name,
      address: {
        line1: form.querySelector("input[name=address").value,
        city: form.querySelector("input[name=city").value,
        postal_code: form.querySelector("input[name=postal_code").value,
        state: form.querySelector("input[name=state").value,
        country
      },
    };

    // Disable the Pay butti o prevent mulitple click events.
    submitButton.disabled = true;
    submitButton.textContent = "Processing_";

    if (payment)  {
      // Let Stripe.js handle the confirmation of the PaymentIntent with the card Element.
      const response = await stripe.confirmCardPayment (paymentIntent.client_secret, {
        payment_method: {
          card,
          billing_details: {
            name,
            address: billingAddress,
          },
        },
        shipping
      });
      handlePayment(response);
    } else if (payment === "sepa_debit") {
      // Confirm the PaymentIntent with the IBAN Element.
      const response = await stripe.confirmSepaDebitPayment(paymentIntent.client_secret, {
        payment_method: {
          sepa_debit: iban,
          billing_details: {
            name,
            email
          },
        },
      });
      handlePayment(response);
    } else {
      // Prepare all the Stripe source common data.
      const sourceData = {
        type: payment,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        owner: {
          name,
          email
        },
        redirect: {
          return_url: window.location.href
        },
        statement_descriptor: "Stripe Payments",
        metadata: {
          paymentIntent: paymentIntent.id
        },
      };

      // Add extra source information which are specific to a payment method.
      switch (payment) {
        case "ideal": 
          // Confirm the PaymentIntent with the iDEAL bank Element.
          // This will redirect to the banking site.
          stripe.confrmIdealPayment(payment.client_secret, {
            payment_method: {
              ideal: idealBank
            },
            return_url: window.location.href
          });
          return;
        case "sofort":
          // SOFORT: The country is required before redirecting to the bank.
          sourceData.sofort = {
            country
          };
          break;
        case "ach_credit_transfer":
          // ACH Bank Transfer: Only supports USD payments, edit the default config to try it.
          // In test mode. we can set the funds to be received via the owner email.
          sourceData.owner.email = `amount_${paymentIntent.amount}@example.com`;
          break;
      }

      // Create a stripe source with the common data and extra information.
      const { source } = await stripe.createSource(sourceData);
      handleSourceActivation(source);
    }
  });

  // Handle new PaymentIntent result
  const handlePayment = (paymentResponse) => {
    const { paymentIntent, error } = paymentResponse;

    const mainElement = document.getElementById("main");
    const confirmationElement = document.getElementById("confirmation");

    if (error && error.type === "validation_error") {
      mainElement.classList.remove("processing");
      mainElement.classList.remove("receiver");
      submitButton.disabled = false;
      submitButton.textContent = submitButtonPayText;
    } else if (error) {
      mainElement.classList.remove("processing");
      mainElement.classList.remove("receiver");
      confirmationElement.querySelector(".error-message").innerText = error.message;
      mainElement.classList.add("error");
    } else if (paymentIntent.status === "succeeded") {
      // Success. Payment is confirmed. Update the interface to display the confirmation screen.
      mainElement.classList.remove("processing");
      mainElement.classList.remove("receiver");
      // Update the mote about receipt and shipping (the payment has been fully confirmed by the bank).
      confirmationElement.querySelector(".note").innerText = "We just sent your receipt to your email address, and you items will be on their way shortly.";
      mainElement.classList.add("success");
    } else if (paymentIntent.status === "processing") {
      // Success. Now waiting for payment confirmation. Update the interface to display the confirmation screen.
      mainElement.classList.remove("processing");
      // Update the note about receipt and shipping (the payment is not yet confirmed by the bank).
      confirmationElement.querySelector(".note").innerText = "We'll send your receipt and ship your items as soon as your payment is confirmed.";
      mainElement.classList.add("success");
    } else {
      // Payment has failed.
      mainElement.classList.remove("success");
      mainElement.classList.remove("processing");
      mainElement.classList.remove('receiver');
      mainElement.classList.add("error");
    }
  };

  // Handle activation of payment sources not yet supported by paymentIntents
  const handleSourceActivation = (source) => {
    const mainElement = document.getElementById("main");
    const confirmationElement = document.getElementById("confirmation");
    switch (source.flow) {
      case "none":
        if (source.type === "wechat") {
          // Display the QR code.
          const qrCode = new QRCode("wechat-qrcode", {
            text: source.wechat.qr_code_url,
            width: 128,
            height: 128,
            colorDark: "#424770",
            colorLight: "#f8fbfd",
            correctLevel: QRCode.CorrectLevel.H
          });
          // Hide the previous text and update the call to action.
          form.querySelector("payment-info.wechat p").style.display = "none";
          let amount = store.formatPrice(store.getPaymentTotal(), config.currency);
          updateSubmitButtonPayText(`Scan this QR code on WeChat to pay ${amount}`);
          // Start polling the paymentIntent status.
          pollPaymentIntentStatus(paymentIntent.id, 300000);
        } else {
          console.log("Unhandled none flow.", source);
        }
        break;
      case "redirect":
        // Immediately redirect the customer.
        submitButton.textContent = "Redirecting…";
        window.location.replace(source.redirect.url);
        break;
      case "code_verification": 
        // Display the receiver address to send the funds to.
        break;
      case "receiver":
        //Display the receiver address to send the funds to.
        mainElement.classList.add("success", "receiver");
        const receiverinfo = confirmationElement.querySelector(".receiver .info");
        let amount = store.formatPrice(source.amount, config.currency);
        switch (source.type) {
          case "ach_credit_transfer":
            // Display the ACH Bank transfer information to the user.
            const ach = source.ach_credit_transfer;
            receiverinfo.innerHTML = `
              <ul>
                <li>
                  Amount:
                  <strong>${amount}</strong>
                </li>
                <li>
                  Bank Name:
                  <strong>${ach.bank_name}</strong>
                </li>
                <li>
                  Account Number:
                  <strong>${ach.account_number}</strong>
                </li>
                <li>
                  Routing Number:
                  <strong>${ach.routing_number}</strong>
                </li>
              </ul>`;
            break;
          case "multibanco":
            //Display the multibanco payment information to the user.
            const multibanco = source.multibanco;
            receiverinfo.innerHTML = `
              <ul>
                <li>
                  Amount (Motante):
                  <strong>${amount}</strong>
                </li>
                <li>
                  Entity (Entidade):
                  <strong>${multibanco.entity}</strong>
                </li>
                <li>
                  Reference (Reference):
                  <strong>${multibanco.reference}</strong>
                </li>
              </ul>`;
            break;
          default:
            console.log("Unhandled receiver flow.", source);
        }
        // Poll the PaymentIntent status
        pollPaymentIntentStatus(paymentIntent.id);
        break
      default:
        // Customer's PaymentIntent is received, pending payment confirmation.
        break;
    }
  };

  /** Monitor the status of a source a after a redirect flow. */
  const pollPaymentIntentStatus = async (
    paymentIntent,
    timeout = 30000,
    interval = 500,
    start = null
  ) => {
    start = start ? start : Date.now();
    const endStates = ["succeeded", "processing", "canceled"];
    //Retrieve the PaymentIntent status from our server.
    const rowResponse = await fetch(`payment_intents/${paymentIntent}/status`);
    const response = await rawResponse.json();
    if (!endStates.includes(response.paymentIntent.status) && Date.now() < start + timeout) {
      // Not done yet, let's wait and check again.
      setTimeout(
        pollPaymentIntentStatus,
        interval,
        paymentIntent,
        timeout,
        interval,
        start
      );
    } else {
      handlePayment(response);
      if (!endStates.includes(response.paymentIntent.status)) {
        // Status has not changed yet. Let's time out.
        console.warn(new Error("polling timed out."));
      }
    }
  };

  const url = new URL(window.location.href);
  const mainElement = document.getElementById("main");
  if (url.searchParams.get("source") && url.searchParams.get("client_secret")) {
    // Update the interface to display the processing screen.
    mainElement.classList.add("checkout", "success", "processing");

    const { source } = await stripe.retrieveSource({
      id: url.searchParams.get("source"),
      client_secret: url.searchParams.get("client_secret")
    });

    // Poll the PaymentIntent status.
    pollPaymentIntentStatus(source.metadata.paymentIntent);
  } else if (url.searchParams.get("payment_intent")) {
    // Poll the PaymentIntent status
    pollPaymentIntentStatus(url.searchParams.get("payment_intent"));
  } else {
    // Update the interface to display the checkout form.
    mainElement.classList.add("checkout");

    // Create the PaymentInteent with the cart details.
    const response = await store.createPaymentIntent(config.currency, store.getLineItems());
    paymentIntent = response.paymentIntent;
  }
  document.getElementById('main').classList.remove("loading");

  /** Display the relevant payment methods for a selected country */
  const paymentMethods = {
    ach_credit_transfer: {
      name: "Bank Trnasfer",
      flow: "receiver",
      countries: ["US"],
      currencies: ["usd"]
    },
    alipay: {
      name: "Alipay",
      flow: "redirect",
      countries: ["CN", "HK", "SG", "JP"],
      currencies: [
        "aud",
        "cad",
        "eur",
        "gbp",
        "hkd",
        "jpy",
        "nzd",
        "sgd",
        "usd",
      ],
    },
    bancontact: {
      name: "Bancontact",
      flow: "redirect",
      countries: ["BE"],
      currencies: ["eur"]
    },
    card: {
      name: "Card",
      flow: "none"
    },
    eps: {
      name: "EPS",
      flow: "redirect",
      countries: ["AT"],
      currencies: ["eur"],
    },
    ideal: {
      name: "iDEAL",
      flow: "redirect",
      countries: ["NL"],
      currencies: ["eur"]
    },
    giropay: {
      name: "Giropay",
      flow: "redirect",
      countries: ["DE"],
      currencies: ["eur"]
    },
    multibanco: {
      name: "Giropay",
      flow: "redirect",
      countries: ["DE"],
      currencies: ["eur"]
    },
    sepa_debit: {
      name: "SEPA Direct Debit",
      flow: "none",
      countries: [
        "FR",
        "DE",
        "ES",
        "BE",
        "NL",
        "LU",
        "IT",
        "PT",
        "AT",
        "IE",
        "FI"
      ],
      currencies: ["eur"],
    },
    sofort: {
      name: "SOFORT",
      flow: "redirect",
      countries: ["DE", "AT"],
      currencies: ["eur"]
    },
    wechat: {
      name: "WeChat",
      flow: "none",
      countries: ["CN", "HK", "SG", "JP"],
      currencies: [
        "aud",
        "cad",
        "eur",
        "gbp",
        "hkd",
        "jpy",
        "nzd",
        "sgd",
        "usd"
      ],
    },
  };

  // Update the main button to reflect the payment method being selected
  const updateButtonLabel = (paymentMethod, bankName) => {
    let amount = store.formatPrice(store.getPaymentTotal(), config.currency);
    let name = paymentMethods[paymentMethod].name;
    let label = `Pay ${amount}`;

    if (paymentMethod !== "card") {
      label =`Pay ${amount} with ${name}`;
    }

    if (paymentMethod === "wechat") {
      label = `Generate QR code to pay ${amount} with ${name}`;
    }

    if (paymentMethod === "sepa_debit" && bankName) {
      label = `Debit ${amount} from ${bankName}`
    }

    updateSubmitButtonPayText(label);
  };

  const selectCountry = (country) => {
    const selector = document.getElementById("country");
    selector.querySelector(`option[value=${country}]`).selected = "selected";
    selector.className = `field ${country.toLowerCase()}`;

    // Trigger the methods to show relevant fields and payment methods on page load.
    showRelevantFormFields();
    showRelevantPaymentMethdos();
  };

  // Show only form fields that are relevant to the selected country.
  const showRelevantFormFields = (country) => {
    if (!country) {
      country = form.querySelector("select[name=country] option:checked").value;
    }
    const zipLabel = form.querySelector("label.zip");
    //Only show the state input for the United States.
    zipLabel.parentElement.classList.toggle('with-state', country === "US");
    //Update the ZIP label to make it more relevant for each country.
    form.querySelector("label.zip span").innerText = country === "US" ?
      "ZIP" : country = "GB" ? "PostCode" : "Postal Code";
  };

  // Show only the payment methods that are relevant to the selected country.
  const showRelevantPaymentMethdos = (country) => {
    if (!country) {
      country = form.querySelector('select[name=country] option:checked').value;
    }

    const paymentInputs = form.querySelectorAll("input[name=payment]");
    for (let i = 0; i < paymentInputs.length; i++) {
      let input = paymentInputs[i];
      input.parentElement.classList.toggle(
        "visible", 
        input.value === card || (config.paymentMethods.includes(input.value) && 
          paymentMethods[input.value].countries.includes(country) &&
          paymentMethods[input.value].currencies.includes(config.currency))
      );
    }

    // Hide the tabs if card is the only available option.
    const paymentMethodTabs = document.getElementById("payment-methods");
    paymentMethodTabs.classList.toggle(
      "visible", 
      paymentMethodTabs.querySelectorAll("li.visible").length > 1
    );

    // Check the first payment option again
    paymentInputs[0].checked = "checked";
    form.querySelector(".payment-info.card").classList.add("visible");
    form.querySelector(".payment-info.ideal").classList.remove("visible");
    form.querySelector(".payment-info.sepa_debit").classList.remove("visible");
    form.querySelector(".payment-info.wechat").classList.remove("visible");
    form.querySelector(".payment-info.redirect").classList.remove("visible");
  };

  // Listen to changes to the payment method selector.
  for (let input of document.querySelectorAll("input[name=payment")) {
    input.addEventListener("change", (event) => {
      event.preventDefault();
      const payment = form.querySelector("input[name=payment]:checked").value;
      const flow = paymentMethods[payment].flow;

      //Update buttoon label.
      updateButtonLabel(event.target.value);

      // Show the relevant details, whether it's an extra element or extra information for the user.
      form
        .querySelector(".payment-info.card")
        .classList.toggle("visible", payment === "card");
      form
        .querySelector(".payment-info.ideal")
        .classList.toggle("visible", payment === "ideal");
      form
        .querySelector(".payment-info.sepa-debit")
        .classList.toggle("visible", payment === "sepa-debit");
      form
        .querySelector(".payment-info.wechat")
        .classList.toggle("visible", payment === "wechat");
      form
        .querySelector(".payment-info.redirect")
        .classList.toggle("visible", payment === "redirect");
      form
        .querySelector(".payment-info.receiver")
        .classList.toggle("visible", payment === "receiver");
      document
        .getElementById(".card-errors")
        .classList.remove("visible", payment !== "card");
    });
  }

  // Select the default country from the config onm page load.
  let country = config.country;
  // Override it if a valid country is passed as a URL paramter.
  const urlParams = new URLSearchParams(window.location.search);
  let countryParam = urlParams.get("country") 
    ? urlParams.get("country").toUpperCase()
    : config.country;
  if (form.querySelector(`option[value="${countryParam}]`)) {
    country = countryParam;
  }

  selectCountry(country);
})();