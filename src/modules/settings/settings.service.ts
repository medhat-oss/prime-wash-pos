import { query } from '../../config/db.js';

export interface PosSettings {
  id?: string;
  pos_background_url: string | null;
  pos_background_type: 'none' | 'image' | 'video';
  pos_background_opacity: number;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  card_bg_color?: string;
  border_color?: string;
  app_bg_color?: string;
  header_bg_color?: string;
  created_at?: string;
  updated_at?: string;
}

export class SettingsService {
  /**
   * Get current POS appearance and theme settings
   */
  static async getPosSettings(): Promise<PosSettings> {
    const res = await query(
      `SELECT 
        id,
        pos_background_url,
        pos_background_type,
        pos_background_opacity::float AS pos_background_opacity,
        COALESCE(primary_color, '#06b6d4') AS primary_color,
        COALESCE(secondary_color, '#3b82f6') AS secondary_color,
        COALESCE(accent_color, '#10b981') AS accent_color,
        COALESCE(card_bg_color, 'rgba(15, 23, 42, 0.75)') AS card_bg_color,
        COALESCE(border_color, 'rgba(51, 65, 85, 0.6)') AS border_color,
        COALESCE(app_bg_color, '#090d16') AS app_bg_color,
        COALESCE(header_bg_color, 'rgba(15, 23, 42, 0.85)') AS header_bg_color,
        created_at,
        updated_at
       FROM system_settings 
       ORDER BY created_at ASC 
       LIMIT 1`
    );

    if (res.rows.length > 0) {
      return res.rows[0];
    }

    // Default fallback if row does not exist yet
    return {
      pos_background_url: null,
      pos_background_type: 'none',
      pos_background_opacity: 0.25,
      primary_color: '#06b6d4',
      secondary_color: '#3b82f6',
      accent_color: '#10b981',
      card_bg_color: 'rgba(15, 23, 42, 0.75)',
      border_color: 'rgba(51, 65, 85, 0.6)',
      app_bg_color: '#090d16',
      header_bg_color: 'rgba(15, 23, 42, 0.85)',
    };
  }

  /**
   * Update POS appearance and theme settings
   */
  static async updatePosSettings(data: {
    pos_background_url?: string | null;
    pos_background_type?: 'none' | 'image' | 'video';
    pos_background_opacity?: number;
    primary_color?: string;
    secondary_color?: string;
    accent_color?: string;
    card_bg_color?: string;
    border_color?: string;
    app_bg_color?: string;
    header_bg_color?: string;
  }): Promise<PosSettings> {
    const current = await this.getPosSettings();

    const bgUrl =
      data.pos_background_url !== undefined
        ? data.pos_background_url ? data.pos_background_url.trim() : null
        : current.pos_background_url;

    const bgType =
      data.pos_background_type !== undefined
        ? data.pos_background_type
        : current.pos_background_type || 'none';

    let bgOpacity =
      data.pos_background_opacity !== undefined
        ? Number(data.pos_background_opacity)
        : Number(current.pos_background_opacity ?? 0.25);

    if (isNaN(bgOpacity) || bgOpacity < 0) bgOpacity = 0;
    if (bgOpacity > 1) bgOpacity = 1;

    const primaryColor = data.primary_color ? data.primary_color.trim() : current.primary_color || '#06b6d4';
    const secondaryColor = data.secondary_color ? data.secondary_color.trim() : current.secondary_color || '#3b82f6';
    const accentColor = data.accent_color ? data.accent_color.trim() : current.accent_color || '#10b981';
    const cardBgColor = data.card_bg_color ? data.card_bg_color.trim() : current.card_bg_color || 'rgba(15, 23, 42, 0.75)';
    const borderColor = data.border_color ? data.border_color.trim() : current.border_color || 'rgba(51, 65, 85, 0.6)';
    const appBgColor = data.app_bg_color ? data.app_bg_color.trim() : current.app_bg_color || '#090d16';
    const headerBgColor = data.header_bg_color ? data.header_bg_color.trim() : current.header_bg_color || 'rgba(15, 23, 42, 0.85)';

    if (current.id) {
      const res = await query(
        `UPDATE system_settings
         SET 
           pos_background_url = $1,
           pos_background_type = $2,
           pos_background_opacity = $3,
           primary_color = $4,
           secondary_color = $5,
           accent_color = $6,
           card_bg_color = $7,
           border_color = $8,
           app_bg_color = $9,
           header_bg_color = $10,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $11
         RETURNING 
           id,
           pos_background_url,
           pos_background_type,
           pos_background_opacity::float AS pos_background_opacity,
           primary_color,
           secondary_color,
           accent_color,
           card_bg_color,
           border_color,
           app_bg_color,
           header_bg_color,
           created_at,
           updated_at`,
        [bgUrl, bgType, bgOpacity, primaryColor, secondaryColor, accentColor, cardBgColor, borderColor, appBgColor, headerBgColor, current.id]
      );
      return res.rows[0];
    } else {
      const res = await query(
        `INSERT INTO system_settings (
           pos_background_url, 
           pos_background_type, 
           pos_background_opacity,
           primary_color,
           secondary_color,
           accent_color,
           card_bg_color,
           border_color,
           app_bg_color,
           header_bg_color
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING 
           id,
           pos_background_url,
           pos_background_type,
           pos_background_opacity::float AS pos_background_opacity,
           primary_color,
           secondary_color,
           accent_color,
           card_bg_color,
           border_color,
           app_bg_color,
           header_bg_color,
           created_at,
           updated_at`,
        [bgUrl, bgType, bgOpacity, primaryColor, secondaryColor, accentColor, cardBgColor, borderColor, appBgColor, headerBgColor]
      );
      return res.rows[0];
    }
  }
}

