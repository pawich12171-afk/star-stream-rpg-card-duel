import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('ตรวจสอบสถานะบอท');

export async function execute(interaction) {
  await interaction.reply(`🏓 Pong! ${interaction.client.ws.ping}ms`);
}
