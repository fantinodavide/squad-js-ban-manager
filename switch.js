import DiscordBasePlugin from './discord-base-plugin.js';

export default class BanManager extends DiscordBasePlugin {
    static get description() {
        return "Ban Manager plugin";
    }

    static get defaultEnabled() {
        return true;
    }

    static get optionsSpecification() {
        return {
            ...DiscordBasePlugin.optionsSpecification,
            commandPrefix: {
                required: false,
                description: "Prefix of every switch command",
                default: "!ban"
            }
        };
    }

    constructor(server, options, connectors) {
        super(server, options, connectors);

        console.log(this.server.rcon);

        this.broadcast = (msg) => { this.server.rcon.broadcast(msg); };
        this.warn = (steamid, msg) => { this.server.rcon.warn(steamid, msg); };
    }

    async mount() {
        this.server.on('CHAT_MESSAGE', this.onChatMessage);
        this.server.on('PLAYER_CONNECTED', this.onPlayerConnected);
    }

    async unmount() {
        this.verbose(1, 'Un-mounted.');
    }

    async onChatMessage(info) {
        const { steamID, name: playerName } = info;
        const message = info.message.toLowerCase();

        if (!message.startsWith(this.options.commandPrefix)) return;

        const commandSplit = message.substring(this.options.commandPrefix.length).trim().split(' ');
        const subCommand = commandSplit[ 0 ];

        const isAdmin = info.chat === "ChatAdmin";
        switch (subCommand) {
            case 'add':
                break;
            case 'help':
                break;
            default:
                await this.warn(steamID, `Unknown vote subcommand: ${subCommand}`);
                return;
        }
    }

    async onPlayerConnected(dt){

    }
}