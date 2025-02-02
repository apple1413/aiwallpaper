"use client";

import { Button } from "@/components/ui/button";
import { CheckIcon } from "@heroicons/react/20/solid";
import { loadStripe } from "@stripe/stripe-js";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useState } from "react";
import QRCode from 'qrcode';

const tiers = [
  {
    priceId:"price_1QisyNBaSEFkYaULnX49RLyT",
    name: "试用版",
    id: "try",
    href: "#",
    priceMonthly: "¥5.20",
    unit: "一次性支付",
    plan: "one-time",
    amount: 520,
    currency: "cny",
    credits: 20,
    description: "",
    features: [
      "可生成 20 个 AI 红包封面",
      "永久有效",
      "高清的图片质量",
      "较快的生成速度",
      "不限制 AI 红包封面下载次数",
    ],
    featured: true,
  },
  {
    priceId:"price_1QisznBaSEFkYaULCKJS6vKI",
    name: "畅享版",
    id: "one-time-payment",
    href: "#",
    priceMonthly: "¥20.25",
    unit: "一次性支付",
    plan: "one-time",
    amount: 2025,
    currency: "cny",
    credits: 80,
    description: "",
    features: [
      "可生成 80 个 AI 红包封面",
      "永久有效",
      "超清的图片质量",
      "更快的生成速度",
      "不限制 AI 红包封面下载次数",
    ],
    featured: false,
  },
];

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

export default function () {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

  const handleCheckout = async (
    priceId: string,
    plan: string,
    amount: number,
    currency: string,
    credits: number
  ) => {
    try {
      const params = {
        priceId: priceId,
        plan: plan,
        credits: credits,
        amount: amount,
        currency: currency,
        return_url: `${window.location.origin}/pay-success/wechat`
      };
      setLoading(true);
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
      });

      if (response.status === 401) {
        setLoading(false);
        toast.error("需要登录");
        router.push("/sign-in");
        return;
      }

      const { code, message, data } = await response.json();
      console.log("checkout response: ", data.qr_code);
      // 处理微信支付响应
      if (data?.payment_type === 'wechat' && data?.qr_code) {
        try {
          // 生成二维码 URL
          const qrDataUrl = await QRCode.toDataURL(data.qr_code);
          setQrCodeUrl(qrDataUrl);
          
          // 添加轮询检查支付状态
          const checkPaymentStatus = setInterval(async () => {
            try {
              const statusResponse = await fetch(`/api/orders/wechat/status?order_no=${data.order_no}`);
              const statusData = await statusResponse.json();
              
              if (statusData.paid) {
                clearInterval(checkPaymentStatus);
                setQrCodeUrl(null);
                router.push(`/pay-success/wechat?order_no=${data.order_no}`);
              }
            } catch (error) {
              console.error('检查支付状态失败:', error);
            }
          }, 2000); // 每2秒检查一次

          // 设置超时时间
          setTimeout(() => {
            clearInterval(checkPaymentStatus);
          }, 5 * 60 * 1000); // 5分钟后停止轮询

          setLoading(false);
          return;
        } catch (error) {
          console.error('生成二维码失败:', error);
          toast.error('生成支付二维码失败');
          setLoading(false);
          return;
        }
      }

      // 处理 Stripe 支付
      if (!data || !data.public_key || !data.session_id) {
        setLoading(false);
        toast.error(message || "支付失败");
        return;
      }

      const stripe = await loadStripe(data.public_key);
      if (!stripe) {
        setLoading(false);
        toast.error("支付初始化失败");
        return;
      }

      const result = await stripe.redirectToCheckout({
        sessionId: data.session_id,
      });

      if (result.error) {
        setLoading(false);
        toast.error(result.error.message);
      }
    } catch (e) {
      setLoading(false);
      console.log("checkout failed: ", e);
      toast.error("支付失败");
    }
  };

  return (
    <div className="relative isolate bg-white px-6 py-8 md:py-16 lg:px-8">
      <div className="mx-auto max-w-3xl text-center lg:max-w-4xl">
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-primary sm:text-6xl">
          付费方案
        </h1>
      </div>
      <h2 className="mx-auto mt-6 max-w-2xl text-center text-lg leading-8 text-gray-600">
        选择一个付费方案，支付完成后可生成 AI 红包封面
      </h2>
      
      {qrCodeUrl ? (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-lg max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-center mb-4">微信支付</h3>
            <div className="flex justify-center mb-4">
              <img src={qrCodeUrl} alt="微信支付二维码" className="w-64 h-64" />
            </div>
            <p className="text-center text-gray-600 mb-4">
              请使用微信扫描二维码完成支付
            </p>
            <Button 
              className="w-full"
              onClick={() => setQrCodeUrl(null)}
            >
              关闭
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mx-auto mt-16 grid max-w-lg grid-cols-1 items-center gap-y-6 sm:mt-20 sm:gap-y-0 lg:max-w-4xl lg:grid-cols-2">
        {tiers.map((tier, tierIdx) => (
          <div
            key={tier.id}
            className={classNames(
              tier.featured
                ? "relative bg-white shadow-2xl"
                : "bg-white/60 sm:mx-8 lg:mx-0",
              tier.featured
                ? ""
                : tierIdx === 0
                ? "rounded-t-3xl sm:rounded-b-none lg:rounded-tr-none lg:rounded-bl-3xl"
                : "sm:rounded-t-none lg:rounded-tr-3xl lg:rounded-bl-none",
              "rounded-3xl p-8 ring-1 ring-gray-900/10 sm:p-10"
            )}
          >
            <p
              id={tier.id}
              className="text-base font-semibold leading-7 text-indigo-600"
            >
              {tier.name}
            </p>
            <p className="mt-4 flex items-baseline gap-x-2">
              <span className="text-5xl font-bold tracking-tight text-gray-900">
                {tier.priceMonthly}
              </span>
              <span className="text-base text-gray-500">{tier.unit}</span>
            </p>
            <p className="mt-6 text-base leading-7 text-gray-600">
              {tier.description}
            </p>
            <ul
              role="list"
              className="mt-8 space-y-3 text-sm leading-6 text-gray-600 sm:mt-10"
            >
              {tier.features.map((feature) => (
                <li key={feature} className="flex gap-x-3">
                  <CheckIcon
                    className="h-6 w-5 flex-none text-indigo-600"
                    aria-hidden="true"
                  />
                  {feature}
                </li>
              ))}
            </ul>
            <Button
              className="mt-8 w-full"
              disabled={loading}
              onClick={() => {
                handleCheckout(
                  tier.priceId,
                  tier.plan,
                  tier.amount,
                  tier.currency,
                  tier.credits
                );
              }}
            >
              {loading ? "处理中..." : "购买"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
