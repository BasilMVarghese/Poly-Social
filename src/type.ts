export type User = {
  account: string;
  userName: string;
  image: string;
  followers: User[];
};

export enum ThreadType {
  SIMPLE_MESSAGE = "SIMPLE_MESSAGE",
  POSITION_CLOSED = "POSITION_CLOSED",
  TRADE_MADE = "TRADE_MADE",
}

export type ThreadReply = {
  text: string;
  user: User;
  time: number;
  haveSeen: boolean;

  
  replyId: string;
  threadId: string;
};

export type Thread = {
  threadId: string;
  time: number;
  type: ThreadType;
  user: User;
  message: string;
  replies: ThreadReply[];
  likes: number;
  haveSeen: boolean;
};
