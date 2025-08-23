import Message from "./Message";

export default interface Update {
    update_id: number;
    message?: Message;
}