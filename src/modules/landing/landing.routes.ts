import { Router, Request, Response } from 'express';
import { requireAdminAuth } from '../../middleware/adminAuth.js';
import { query } from '../../config/db.js';

const router = Router();

const DEFAULT_LANDING_CONFIG = {
  hero_section_1: {
    media_type: 'video',
    media_url: 'https://assets.mixkit.co/videos/preview/mixkit-washing-a-luxury-black-car-with-foam-41275-large.mp4',
    fallback_image_url: 'https://images.unsplash.com/photo-1601362840469-51e4d8d58785?auto=format&fit=crop&w=1600&q=80',
    show_overlay_text: true,
    title: 'برايم واش — العناية الفائقة والذكية بسيارتك',
    subtitle: 'تقنيات نانو سيراميك متطورة، رغوة ألمانية مخصصة، غسيل بخار دقيق، وتلميع احترافي يحافظ على بريق يدوم طويلاً',
  },
  offer_card_1: {
    id: 'offer-vip-wax',
    title: 'عرض غسيل VIP + طبقة واكس كارنوبا إيطالي',
    badge: 'الأكثر طلباً',
    media_type: 'image',
    media_url: 'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?auto=format&fit=crop&w=1000&q=80',
    fallback_image_url: 'https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?auto=format&fit=crop&w=1000&q=80',
    whatsapp_number: '201223770207',
    whatsapp_prefilled_text: 'مرحباً برايم واش، أود الاستفسار والحجز لعرض (غسيل VIP + طبقة واكس كارنوبا إيطالي)',
  },
  offer_card_2: {
    id: 'offer-nano-ceramic',
    title: 'باقة حماية النانو سيراميك ومعالجة الفرش الداخلي',
    badge: 'حماية فائقة',
    media_type: 'image',
    media_url: 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=1000&q=80',
    fallback_image_url: 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&w=1000&q=80',
    whatsapp_number: '201223770207',
    whatsapp_prefilled_text: 'مرحباً برايم واش، أود الاستفسار والحجز لباقة (حماية النانو سيراميك ومعالجة الفرش الداخلي)',
  },
  hero_section_2: {
    media_type: 'image',
    media_url: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=1600&q=80',
    fallback_image_url: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=1600&q=80',
    show_overlay_text: true,
    title: 'خامات عالمية معتمدة ومتوازنة الحموضة (pH Neutral)',
    subtitle: 'نضمن لك حماية تامة لطلاء الهيكل، الجلد، والزجاج بدون أي خدوش مع فريق فني مدرب على أعلى المعايير العالمية',
  },
  whatsapp_header_number: '201223770207',
  updated_at: new Date().toISOString(),
};

// GET /api/landing/config - Public
router.get('/config', async (_req: Request, res: Response) => {
  try {
    const dbRes = await query(
      `SELECT landing_config FROM system_settings ORDER BY updated_at DESC NULLS LAST LIMIT 1`
    );
    if (dbRes.rows.length > 0 && dbRes.rows[0].landing_config) {
      const cfg = typeof dbRes.rows[0].landing_config === 'string'
        ? JSON.parse(dbRes.rows[0].landing_config)
        : dbRes.rows[0].landing_config;
      return res.json({ success: true, data: { ...DEFAULT_LANDING_CONFIG, ...cfg } });
    }
  } catch {
    // Return default if error or column does not exist
  }
  return res.json({ success: true, data: DEFAULT_LANDING_CONFIG });
});

// PUT /api/landing/config - Protected with Admin PIN
router.put('/config', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const configData = req.body;
    const configJson = JSON.stringify(configData);

    try {
      await query(`ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS landing_config JSONB`);
      await query(
        `UPDATE system_settings
         SET landing_config = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = (SELECT id FROM system_settings ORDER BY created_at ASC LIMIT 1)`,
        [configJson]
      );
    } catch (dbErr) {
      console.warn('Could not persist landing_config to database:', dbErr);
    }

    return res.json({
      success: true,
      message: 'تم حفظ إعدادات صفحة العروض بنجاح',
      data: configData,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message || 'فشل في حفظ إعدادات صفحة العروض',
    });
  }
});

export default router;
