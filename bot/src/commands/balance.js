import { SlashCommandBuilder } from 'discord.js';
import { getDocument, getLinkedCharacterId } from '../db.js';

export const data = new SlashCommandBuilder()
  .setName('balance')
  .setDescription('ดูเงินของตัวละคร');

export async function execute(interaction) {
  const characterId = await getLinkedCharacterId(interaction.user.id);
  if (!characterId) {
    await interaction.reply({ content: '❌ ยังไม่ได้เชื่อมตัวละคร ใช้ /link ก่อน', ephemeral: true });
    return;
  }

  const row = await getDocument('characters', characterId);
  if (!row) {
    await interaction.reply({ content: '❌ ไม่พบตัวละครในฐานข้อมูล', ephemeral: true });
    return;
  }

  const c = row.data || {};
  await interaction.reply(
    `💰 **Coin:** ${Number(c.coins || 0).toLocaleString()}\n✨ **Possibility:** ${Number(c.possibility || 0).toLocaleString()}`
  );
}
