import { insertOrder, updateOrderSession } from "@/models/order";
import { respData, respErr } from "@/lib/resp";

import { Order } from "@/types/order";
import Stripe from "stripe";
import { currentUser } from "@clerk/nextjs";
import { genOrderNo } from "@/lib/order";
import axios from "axios";

interface WeChatPayResponse {
  code: number;
  msg: string;
  data: {
    qrcode: string;
    qrCodeUrl: string;
    data: string;
  };
}

export const maxDuration = 60;

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || !user.emailAddresses || user.emailAddresses.length === 0) {
    console.log("Checkout failed: User not logged in");
    return respErr("not login");
  }
  const user_email = user.emailAddresses[0].emailAddress;
  console.log("[Checkout] User email:", user_email);

  try {
    const { credits, currency, amount, plan, payment_method } = await req.json();
    console.log("[Checkout] Request params:", { credits, currency, amount, plan, payment_method });

    if (!credits || !amount || !plan || !currency) {
      console.log("[Checkout] Invalid params:", { credits, currency, amount, plan });
      return respErr("invalid params");
    }

    if (!["monthly", "one-time"].includes(plan)) {
      return respErr("invalid plan");
    }

    const order_no = genOrderNo();

    const currentDate = new Date();
    const oneMonthLater = new Date(currentDate);
    oneMonthLater.setMonth(currentDate.getMonth() + 1);

    const created_at = currentDate.toISOString();
    const expired_at = oneMonthLater.toISOString();

    const order: Order = {
      order_no: order_no,
      created_at: created_at,
      user_email: user_email,
      amount: amount,
      plan: plan,
      expired_at: expired_at,
      order_status: 1,
      credits: credits,
      currency: currency,
    };
    insertOrder(order);
    console.log("[Checkout] Created order:", order);

    
    // Handle WeChat Pay
    if (currency === "cny" ) {
      console.log("[WeChat Pay] Initializing payment for order:", order_no);
      try {
        const requestParams = {
          out_trade_no: order_no,
          total_fee: credits,
          mch_id: process.env.YUNGOUOS_MCH_ID,
          body: "aicover credits plan",
          type: "1",
          auto: "0",
          notify_url: `${process.env.WEB_BASE_URI}/api/webhook/wechat`,
          attach: "credits purchase",
          return_url: `${process.env.WEB_BASE_URI}/pay-success`,
        };
        console.log("[WeChat Pay] Request params:", requestParams);

        const signParams = {
          out_trade_no: order_no,
          total_fee:credits,
          mch_id: process.env.YUNGOUOS_MCH_ID,
          body: "aicover credits plan",
        };
        
        const sign = generateYunGouOSSign(signParams);
        
        const formData = new URLSearchParams();
        Object.entries(requestParams).forEach(([key, value]) => {
          formData.append(key, value as string);
        });
        formData.append('sign', sign);

        const response = await axios.post(
          'https://api.pay.yungouos.com/api/pay/wxpay/nativePay',
          formData,
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          }
        );

        console.log("[WeChat Pay] API response:", response.data);
        console.log("[WeChat Pay] API qrcode:", (response.data.data));
        if (response.data.code === 0) {
          const responseData = {
            payment_type: 'wechat',
            order_no: order_no,
            qr_code: response.data.data,
            qr_url: response.data.data,
          };
          console.log("[WeChat Pay] Success response:", responseData);
          return respData(responseData);
        } else {
          console.error("[WeChat Pay] API error:", response.data);
          throw new Error(response.data.msg);
        }
      } catch (error) {
        console.error("[WeChat Pay] Error details:", error);
        return respErr("WeChat Pay initialization failed");
      }
    }

    // Handle Stripe Payment
    console.log("[Stripe] Initializing payment for order:", order_no);
    const stripe = new Stripe(process.env.STRIPE_PRIVATE_KEY || "");

    let options: Stripe.Checkout.SessionCreateParams = {
      customer_email: user_email,
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: currency,
            product_data: {
              name: "aicover credits plan",
            },
            unit_amount: amount,
            recurring:
              plan === "monthly"
                ? {
                    interval: "month",
                  }
                : undefined,
          },
          quantity: 1,
        },
      ],
      allow_promotion_codes: false,
      metadata: {
        project: "aicover",
        pay_scene: "buy-credits",
        order_no: order_no.toString(),
        user_email: user_email,
        credits: credits,
      },
      mode: plan === "monthly" ? "subscription" : "payment",
      success_url: `${process.env.WEB_BASE_URI}/pay-success/{CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.WEB_BASE_URI}/pricing`,
    };

    // if (currency === "cny") {
    //   options.payment_method_types = ["wechat_pay", "card"];
    //   options.payment_method_options = {
    //     wechat_pay: {
    //       client: "web",
    //     },
    //   };
    // }

    console.log("[Stripe] Session options:", options);

    const session = await stripe.checkout.sessions.create(options);
    console.log("[Stripe] Created session:", session.id);

    const stripe_session_id = session.id;
    updateOrderSession(order_no, stripe_session_id);
    console.log("[Stripe] Updated order session:", { order_no, stripe_session_id });

    const responseData = {
      payment_type: 'stripe',
      public_key: process.env.STRIPE_PUBLIC_KEY,
      order_no: order_no,
      session_id: stripe_session_id,
    };
    console.log("[Stripe] Success response:", responseData);
    return respData(responseData);
  } catch (e) {
    console.error("[Checkout] Error details:", e);
    return respErr("checkout failed");
  }
}

function generateYunGouOSSign(params: any): string {
  console.log("[WeChat Pay] Generating sign for params:", params);
  
  const sortedKeys = Object.keys(params).sort();
  
  const paramPairs = sortedKeys.map(key => {
    if (params[key] === null || params[key] === undefined || params[key] === '') {
      return '';
    }
    return `${key}=${params[key]}`;
  }).filter(pair => pair !== '');
  
  const paramString = paramPairs.join('&');
  
  const signString = `${paramString}&key=${process.env.YUNGOUOS_KEY}`;
  
  console.log("[WeChat Pay] Pre-sign string:", paramString);
  console.log("[WeChat Pay] Final sign string:", signString);
  
  const sign = require('crypto')
    .createHash('md5')
    .update(signString)
    .digest('hex')
    .toUpperCase();
  
  console.log("[WeChat Pay] Generated sign:", sign);
  return sign;
}
