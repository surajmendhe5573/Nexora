export default class ApiResponse<T = unknown> {
    status: boolean;
    message: string;
    data?: T;

    constructor(status: boolean, message: string, data: T | null = null) {
        this.status = status;
        this.message = message;
        if (data !== null) {
            this.data = data;
        }
    }
}
