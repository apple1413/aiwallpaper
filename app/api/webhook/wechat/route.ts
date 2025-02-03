import { respData, respErr } from "@/lib/resp";
import { handleWechatOrderSession } from "@/services/order";
import { getOrderByOrderNo } from "@/models/order";
import crypto from 'crypto';

interface WechatPayNotification {
    code: string;        // 支付结果 【1：成功，0：失败】
    orderNo: string;     // 系统订单号（YunGouOS系统内部订单号）
    outTradeNo: string;  // 商户订单号
    payNo: string;       // 支付单号（第三方支付单号）
    money: string;       // 支付金额 单位：元
    mchId: string;       // 支付商户号
    payChannel: string;  // 支付通道
    time: string;        // 支付成功时间
    attach: string;      // 附加数据
    openId: string;      // 用户openId
    payBank: string;     // 用户付款渠道
    sign: string;        // 数据签名
}

function verifySign(params: any): boolean {
    console.log("[WeChat Webhook] Starting signature verification");
    const receivedSign = params.sign;
    
    // 按照文档顺序定义参与签名的字段
    const signFields = [
        'code',
        'mchId',
        'money',
        'orderNo',
        'outTradeNo',
        'payNo'
    ];
    
    // 构建签名字符串，保持字段顺序
    const stringArr: string[] = signFields
        .filter(key => params[key] !== null && params[key] !== undefined && params[key] !== '')
        .map(key => `${key}=${params[key]}`);
    
    // 拼接签名字符串
    const signString = stringArr.join('&') + `&key=${process.env.YUNGOUOS_KEY}`;
    
    console.log("[WeChat Webhook] Sign string:", signString);
    
    // 计算签名
    const calculatedSign = crypto
        .createHash('md5')
        .update(signString)
        .digest('hex')
        .toUpperCase();
    
    console.log("[WeChat Webhook] Signature comparison:", {
        received: receivedSign,
        calculated: calculatedSign,
        signString: signString,
        includedParams: stringArr
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
        if (body.mchId !== process.env.YUNGOUOS_MCH_ID) {
            console.error("[WeChat Webhook] ❌ Invalid merchant ID");
            return new Response("FAIL", {
                status: 400,
                headers: { 'Content-Type': 'text/plain' },
            });
        }

        // 验证订单金额
        const order = await getOrderByOrderNo(body.outTradeNo);
        if (!order) {
            console.error("[WeChat Webhook] ❌ Order not found:", body.outTradeNo);
            return new Response("FAIL", {
                status: 400,
                headers: { 'Content-Type': 'text/plain' },
            });
        }

        // 处理订单
        await handleWechatOrderSession(body.outTradeNo);
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