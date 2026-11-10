const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const http = require('http');

// --- MINI SERVEUR WEB (Anti-timeout Render 24/7) ---
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot de test Ping-Pong en ligne !');
});
server.listen(PORT, () => {
  console.log(`🌐 Serveur HTTP actif sur le port ${PORT}`);
});

// --- CLIENT DISCORD ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// --- COMMANDE UNIQUE DE TEST ---
const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Teste si le bot répond !')
].map(cmd => cmd.toJSON());

client.once('ready', async () => {
  console.log(`🤖 Bot connecté : ${client.user.tag}`);
  
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ Commande /ping enregistrée avec succès !');
  } catch (error) {
    console.error(error);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    await interaction.reply(`🏓 Pong ! Latence : **${client.ws.ping}ms**`);
  }
});

client.login(process.env.DISCORD_TOKEN);
