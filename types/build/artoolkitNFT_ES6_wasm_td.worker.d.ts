declare function threadPrintErr(...args: any[]): void;
declare function threadAlert(...args: any[]): void;
declare function handleMessage(e: any): void;
declare namespace Module {
    function instantiateWasm(info: any, receiveInstance: any): any;
}
declare var initializedJS: boolean;
declare var pendingNotifiedProxyingQueues: any[];
declare function err(...args: any[]): void;
