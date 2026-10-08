import { Client, Collection, Events, GatewayIntentBits } from 'discord.js';
import { config } from './config.js';
import * as help from './commands/help.js';
import * as ping from './commands/ping.js';
import * as link from './commands/link.js';
import * as profile from './commands/profile.js';
import * as balance from './commands/balance.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

for (const command of [help, ping, link, profile, balance]) {
  client.commands.set(command.data.name, command);
}

client.once(Events.ClientReady, readyClient => {
  console.log(`[Star Stream] Online as ${readyClient.user.tag}`);
  console.log(`[Star Stream] Commands loaded: ${client.commands.size}`);
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`[Command Error] /${interaction.commandName}`, error);
    const message = '❌ เกิดข้อผิดพลาด กรุณาตรวจสอบ Console ของบอท';
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: message, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
    }
  }
});

client.login(config.discordToken);
