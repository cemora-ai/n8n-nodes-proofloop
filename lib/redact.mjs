// Defense in depth. The n8n node also runs this policy BEFORE transmitting data.
const SENSITIVE_KEYS = /(?:password|passphrase|secret|api[_-]?key|authorization|bearer|access[_-]?token|refresh[_-]?token|cookie|card(?:[_-]?(?:number|cvv|cvc))?|iban|national[_-]?id|identity[_-]?(?:number|no)|tckn|ssn)/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE = /(?<![\w])(?:\+?90[\s.()-]*)?(?:0[\s.()-]*)?5\d{2}[\s.()-]*\d{3}[\s.()-]*\d{2}[\s.()-]*\d{2}(?!\d)/g;
const IBAN = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}\b/gi;

export function validIban(value){
  const iban=String(value).replace(/\s/g,'').toUpperCase();
  if(!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)||iban.length>34)return false;
  const rotated=iban.slice(4)+iban.slice(0,4);
  let rest=0;
  for(const character of rotated){
    const digits=/\d/.test(character)?character:String(character.charCodeAt(0)-55);
    for(const digit of digits)rest=(rest*10+Number(digit))%97;
  }
  return rest===1;
}

export function validLuhn(value) {
  const digits = String(value).replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19 || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0, doubled = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = Number(digits[i]);
    if (doubled && (digit *= 2) > 9) digit -= 9;
    sum += digit; doubled = !doubled;
  }
  return sum % 10 === 0;
}

export function validTckn(value) {
  if (!/^[1-9]\d{10}$/.test(value)) return false;
  const d = [...value].map(Number);
  const odds = d[0]+d[2]+d[4]+d[6]+d[8];
  const evens = d[1]+d[3]+d[5]+d[7];
  return ((odds*7-evens)%10+10)%10 === d[9] && d.slice(0,10).reduce((a,b)=>a+b,0)%10 === d[10];
}

export function redactText(input) {
  return String(input)
    .replace(EMAIL, '[REDACTED_EMAIL]')
    .replace(PHONE, '[REDACTED_PHONE]')
    .replace(/(?<!\d)\d{11}(?!\d)/g, value => validTckn(value) ? '[REDACTED_TCKN]' : value)
    .replace(/(?<!\d)(?:\d[\s-]?){13,19}(?!\d)/g, value => validLuhn(value) ? '[REDACTED_CARD]' : value)
    .replace(IBAN,value=>validIban(value)?'[REDACTED_IBAN]':value);
}

export function redactPersonalData(value, depth = 0) {
  if (depth > 12) return '[REDACTED_DEPTH_LIMIT]';
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.slice(0, 500).map(item => redactPersonalData(item, depth+1));
  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, item] of Object.entries(value).slice(0, 500))
      result[key] = SENSITIVE_KEYS.test(key) ? '[REDACTED_FIELD]' : redactPersonalData(item, depth+1);
    return result;
  }
  return value;
}
