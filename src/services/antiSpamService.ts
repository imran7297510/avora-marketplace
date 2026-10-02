export class MessageAntiSpamService {
  private static instance: MessageAntiSpamService;
  private sentMessages: { timestamp: number; text: string; chatId: string }[] = [];

  private constructor() {}

  public static getInstance(): MessageAntiSpamService {
    if (!MessageAntiSpamService.instance) {
      MessageAntiSpamService.instance = new MessageAntiSpamService();
    }
    return MessageAntiSpamService.instance;
  }

  public validateMessage(text: string, chatId: string): { isValid: boolean; errorMessage?: string } {
    // 1. Empty message prevention
    const trimmedText = text.trim();
    if (!trimmedText) {
      return { isValid: false, errorMessage: "Message cannot be empty." };
    }

    const now = Date.now();
    
    // Clean up history older than 30 seconds
    this.sentMessages = this.sentMessages.filter(msg => now - msg.timestamp < 30000);

    // Filter by this specific chat
    const chatHistory = this.sentMessages.filter(msg => msg.chatId === chatId);

    // 2. Rapid Message Rate Limit (Max 5 within 10s per conversation)
    const recentHistory10s = chatHistory.filter(msg => now - msg.timestamp < 10000);
    if (recentHistory10s.length >= 5) {
      return { isValid: false, errorMessage: "You are sending messages too fast. Please wait a moment." };
    }

    // 3. Duplicate Message Protection (Identical message within 30 seconds)
    const isDuplicate = this.sentMessages.some(msg => msg.text === trimmedText);
    if (isDuplicate) {
      return { isValid: false, errorMessage: "You can't send the same message within 30 seconds." };
    }

    return { isValid: true };
  }

  public recordMessage(text: string, chatId: string): void {
    this.sentMessages.push({
      timestamp: Date.now(),
      text: text.trim(),
      chatId,
    });
  }
}

export const antiSpamService = MessageAntiSpamService.getInstance();
