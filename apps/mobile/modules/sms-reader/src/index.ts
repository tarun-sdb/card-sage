import { requireNativeModule } from 'expo-modules-core';

// Calls into Kotlin Telephony.Sms.Inbox read. Android only.
export default requireNativeModule('SmsReader');
