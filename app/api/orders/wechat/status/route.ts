import { respData, respErr } from "@/lib/resp";
import { getOrderByOrderNo } from "@/models/order";

export async function GET(req: Request) {
    console.log("[Order Status] ====== Start Checking Order Status ======");
    console.log("[Order Status] Request URL:", req.url);
    
    try {
        // 从 URL 获取订单号
        const { searchParams } = new URL(req.url);
        const orderNo = searchParams.get('order_no');
        console.log("[Order Status] Query parameters:", Object.fromEntries(searchParams));

        if (!orderNo) {
            console.log("[Order Status] ❌ Missing order number");
            return respErr("订单号不能为空");
        }

        console.log("[Order Status] 🔍 Checking order:", orderNo);

        // 查询订单
        const order = await getOrderByOrderNo(orderNo);
        
        if (!order) {
            console.log("[Order Status] ❌ Order not found:", orderNo);
            return respErr("订单不存在");
        }

        console.log("[Order Status] ✅ Order found:", {
            orderNo: order.order_no,
            status: order.order_status,
            createdAt: order.created_at,
            amount: order.amount,
            currency: order.currency
        });

        // 返回订单支付状态
        const response = {
            paid: order.order_status === 2,
            status: order.order_status,
            orderNo: order.order_no
        };
        
        console.log("[Order Status] Sending response:", response);
        console.log("[Order Status] ====== Order Status Check Complete ======");
        
        return respData(response);

    } catch (error) {
        console.error("[Order Status] ❌ Error checking order status:", error);
        if (error instanceof Error) {
            console.error("[Order Status] Error details:", {
                name: error.name,
                message: error.message
            });
        }
        console.log("[Order Status] ====== Order Status Check Failed ======");
        return respErr("查询订单状态失败");
    }
} 