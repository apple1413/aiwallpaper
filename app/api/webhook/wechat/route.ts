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
        // 处理 form-urlencoded 格式的请求
        const formData = await req.formData();
        const body: Record<string, string> = {};
        formData.forEach((value, key) => {
            body[key] = value.toString();
        });
        
        console.log("[WeChat Webhook] Received notification:", body);

        // 验证签名
        if (!verifySign(body)) {
            console.error("[WeChat Webhook] ❌ Invalid signature");
            return new Response("FAIL", {
                status: 400,
                headers: { 'Content-Type': 'text/plain' },
            });
        }

        // 验证商户号
        if (body.mch_id !== process.env.YUNGOUOS_MCH_ID) {
            console.error("[WeChat Webhook] ❌ Invalid merchant ID");
            return new Response("FAIL", {
                status: 400,
                headers: { 'Content-Type': 'text/plain' },
            });
        }

        // 验证订单金额
        const order = await getOrderByOrderNo(body.out_trade_no);
        if (!order) {
            console.error("[WeChat Webhook] ❌ Order not found:", body.out_trade_no);
            return new Response("FAIL", {
                status: 400,
                headers: { 'Content-Type': 'text/plain' },
            });
        }

        // 处理订单
        await handleWechatOrderSession(body.out_trade_no);
        console.log("[WeChat Webhook] ✅ Order processed successfully");
        
        return new Response("SUCCESS", {
            status: 200,
            headers: {
                'Content-Type': 'text/plain',
            },
        });
    } catch (error) {
        console.error("[WeChat Webhook] ❌ Error processing webhook:", error);
        return new Response("FAIL", {
            status: 500,
            headers: {
                'Content-Type': 'text/plain',
            },
        });
    }
}