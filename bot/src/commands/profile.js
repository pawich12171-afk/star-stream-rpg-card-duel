import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getDocument, getLinkedCharacterId } from '../db.js';

export const data = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('ดูโปรไฟล์ตัวละครของคุณ');

export async function execute(interaction) {
  const characterId = await getLinkedCharacterId(interaction.user.id);

  if (!characterId) {
    await interaction.reply({ content: '❌ ยังไม่ได้เชื่อมตัวละคร ใช้ /link ก่อน', ephemeral: true });
    return;
  }

  const row = await getDocument('characters', characterId);
  if (!row) {
    await interaction.reply({ content: '❌ ไม่พบตัวละครที่เชื่อมไว้', ephemeral: true });
    return;
  }

  const c = row.data || {};
  const s = c.stats || {};

  const embed = new EmbedBuilder()
    .setTitle(`⭐ ${c.displayName || c.username || 'Character'}`)
    .setDescription(c.quote || c.personalBio || 'ไม่มีคำอธิบาย')
    .addFields(
      { name: '💰 Coin', value: String(Number(c.coins || 0)), inline: true },
      { name: '✨ Possibility', value: String(Number(c.possibility || 0)), inline: true },
      { name: '❤️ HP', value: `${Number(c.hp || 0)} / ${Number(c.maxHp || 0)}`, inline: true },
      { name: '⚔️ STR', value: String(Number(s.strength || 0)), inline: true },
      { name: '🛡️ DUR', value: String(Number(s.durability || 0)), inline: true },
      { name: '⚡ AGI', value: String(Number(s.agility || 0)), inline: true },
      { name: '🔮 MAG', value: String(Number(s.magic || 0)), inline: true },
      { name: '🎒 ไอเทม', value: String(Array.isArray(c.inventory) ? c.inventory.length : 0), inline: true }
    )
    .setFooter({ text: `Character ID: ${characterId}` });

  if (c.avatarUrl && /^https?:\/\//i.test(c.avatarUrl)) embed.setThumbnail(c.avatarUrl);
  await interaction.reply({ embeds: [embed] });
}
