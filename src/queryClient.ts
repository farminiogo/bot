import { QueryClient } from '@tanstack/react-query';

// إنشاء كائن QueryClient مع الإعدادات الافتراضية
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // تعيين وقت انتهاء صلاحية البيانات إلى 5 دقائق
      cacheTime: 10 * 60 * 1000, // تعيين مدة الاحتفاظ بالبيانات إلى 10 دقائق
      retry: 2, // عدد مرات إعادة المحاولة عند فشل الطلب
      refetchOnWindowFocus: false, // تعطيل إعادة الجلب عند تنشيط النافذة
    },
  },
});

export default queryClient;
