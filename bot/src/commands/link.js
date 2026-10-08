import { SlashCommandBuilder } from 'discord.js';
import { getDocument, linkDiscordCharacter } from '../db.js';

export const data = new SlashCommandBuilder()
  .setName('link')
  .setDescription('เชื่อม Discord เข้ากับตัวละคร Star Stream')
  .addStringOption(option =>
    option.setName('character_id')
      .setDescription('ID ตัวละครที่มีอยู่ในฐานข้อมูล')
      .setRequired(true)
  );

export async function execute(interaction) {
  const characterId = interaction.options.getString('character_id', true).trim();
  const character = await getDocument('characters', characterId);

  if (!character) {
    await interaction.reply({ content: '❌ ไม่พบตัวละคร ID นี้ในฐานข้อมูล', ephemeral: true });
    return;
  }

  await linkDiscordCharacter(interaction.user.id, characterId);
  const name = character.data?.displayName || character.data?.username || characterId;

  await interaction.reply({
    content: `✅ เชื่อมสำเร็จแล้ว\nตัวละคร: **${name}**\nCharacter ID: \`${characterId}\``,
    ephemeral: true
  });
}
