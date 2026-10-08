import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

export const supabase = createClient(
  config.supabaseUrl,
  config.supabaseServiceRoleKey,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function getDocument(collection, id) {
  const { data, error } = await supabase
    .from('star_stream_documents')
    .select('collection,id,data,updated_at')
    .eq('collection', collection)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function setDocument(collection, id, data) {
  const { data: row, error } = await supabase
    .from('star_stream_documents')
    .upsert({ collection, id, data, updated_at: Date.now() }, { onConflict: 'collection,id' })
    .select('collection,id,data,updated_at')
    .single();
  if (error) throw error;
  return row;
}

export async function getLinkedCharacterId(discordUserId) {
  const row = await getDocument('discord_links', discordUserId);
  return row?.data?.characterId || null;
}

export async function linkDiscordCharacter(discordUserId, characterId) {
  return setDocument('discord_links', discordUserId, { characterId, linkedAt: Date.now() });
}
