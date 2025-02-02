import { respData, respErr } from "@/lib/resp";
import { handleWechatOrderSession } from "@/services/order";
import { getOrderByOrderNo } from "@/models/order";
import crypto from 'crypto';

interface WechatPayNotification {
  out_trade_no: string;    // 商户订单号
  total_fee: string;       // 订单金额
  sign: string;           // 签名
  mch_id: string;         // 商户号
  // ... 其他字段
}

function verifySign(params: any): boolean {
  console.log("[WeChat Webhook] Starting signature verification");
  const receivedSign = params.sign;
  delete params.sign; // 验签时不包含sign字段
  
  const sortedKeys = Object.keys(params).sort();
  const paramPairs = sortedKeys
    .filter(key => params[key] !== null && params[key] !== undefined && params[key] !== '')
    .map(key => `${key}=${params[key]}`);
  
  const paramString = paramPairs.join('&');
  const signString = `${paramString}&key=${process.env.YUNGOUOS_KEY}`;
  
  console.log("[WeChat Webhook] Param string for signing:", paramString);
  
  const calculatedSign = crypto
    .createHash('md5')
    .update(signString)
    .digest('hex')
    .toUpperCase();
  
  console.log("[WeChat Webhook] Signature comparison:", {
    received: receivedSign,
    calculated: calculatedSign
  });
  
  return calculatedSign === receivedSign;
}

export async function POST(req: Request) {
    try {
        console.log("[WeChat Webhook] Received payment notification");
        const body: WechatPayNotification = await req.json();
        console.log("[WeChat Webhook] Notification body:", JSON.stringify(body, null, 2));

        // 1. 验证签名
        console.log("[WeChat Webhook] Verifying signature...");
        if (!verifySign(body)) {
            console.error("[WeChat Webhook] ❌ Signature verification failed");
            return new Response("FAIL", {
                status: 400,
                headers: { 'Content-Type': 'text/plain' },
            });
        }
        console.log("[WeChat Webhook] ✅ Signature verified successfully");

        // 2. 验证商户号
        console.log("[WeChat Webhook] Verifying merchant ID...");
        if (body.mch_id !== process.env.YUNGOUOS_MCH_ID) {
            console.error("[WeChat Webhook] ❌ Invalid merchant ID:", {
                received: body.mch_id,
                expected: process.env.YUNGOUOS_MCH_ID
            });
            return new Response("FAIL", {
                status: 400,
                headers: { 'Content-Type': 'text/plain' },
            });
        }
        console.log("[WeChat Webhook] ✅ Merchant ID verified successfully");

        // 3. 验证订单金额
        console.log("[WeChat Webhook] Fetching order details...");
        const order = await getOrderByOrderNo(body.out_trade_no);
        if (!order) {
            console.error("[WeChat Webhook] ❌ Order not found:", body.out_trade_no);
            return new Response("FAIL", {
                status: 400,
                headers: { 'Content-Type': 'text/plain' },
            });
        }
        console.log("[WeChat Webhook] Order details:", {
            orderNo: order.order_no,
            amount: order.amount,
            status: order.order_status
        });

        // 验证订单金额
        console.log("[WeChat Webhook] Verifying payment amount...");
        if (parseFloat(body.total_fee) !== order.amount) {
            console.error("[WeChat Webhook] ❌ Amount mismatch:", {
                received: body.total_fee,
                expected: order.amount,
                difference: parseFloat(body.total_fee) - order.amount
            });
            return new Response("FAIL", {
                status: 400,
                headers: { 'Content-Type': 'text/plain' },
            });
        }
        console.log("[WeChat Webhook] ✅ Payment amount verified successfully");

        // 4. 处理订单
        console.log("[WeChat Webhook] Processing order payment...");
        await handleWechatOrderSession(body.out_trade_no);
        console.log("[WeChat Webhook] ✅ Order processed successfully");
        
        console.log("[WeChat Webhook] Sending success response");
        return new Response("SUCCESS", {
            status: 200,
            headers: {
                'Content-Type': 'text/plain',
            },
        });
    } catch (error) {
        console.error("[WeChat Webhook] ❌ Error processing webhook:", error);
        if (error instanceof Error) {
            console.error("[WeChat Webhook] Error details:", {
                message: error.message,
                stack: error.stack
            });
        }
        return new Response("FAIL", {
            status: 500,
            headers: {
                'Content-Type': 'text/plain',
            },
        });
    }
}