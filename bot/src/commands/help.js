import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('ดูคำสั่งของ Star Stream Discord Bot');

export async function execute(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('⭐ Star Stream RPG')
    .setDescription('คำสั่งพื้นฐานของบอท')
    .addFields(
      { name: '/ping', value: 'ตรวจสอบว่าบอทออนไลน์หรือไม่' },
      { name: '/link', value: 'เชื่อม Discord เข้ากับตัวละครเดิม' },
      { name: '/profile', value: 'ดูโปรไฟล์ตัวละคร' },
      { name: '/balance', value: 'ดู Coin และ Possibility' },
      { name: '/help', value: 'แสดงคำสั่งทั้งหมด' }
    );
  await interaction.reply({ embeds: [embed] });
}
