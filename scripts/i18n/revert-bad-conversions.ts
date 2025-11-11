import { readFileSync, writeFileSync } from 'fs';
import { globSync } from 'glob';

const badPatterns = [
  // Library imports
  { from: /from \{t\("admin\.[^"]+\.lucidereact"\)\}/g, to: 'from "lucide-react"' },
  { from: /from \{t\("admin\.[^"]+\.reacticons"\)\}/g, to: 'from "react-icons"' },
  
  // Component variants
  { from: /variant:\s*\{t\("admin\.[^"]+\.destructive"\)\}/g, to: 'variant: "destructive"' },
  { from: /variant=\{t\("admin\.[^"]+\.destructive"\)\}/g, to: 'variant="destructive"' },
  { from: /variant:\s*\{t\("admin\.[^"]+\.outline"\)\}/g, to: 'variant: "outline"' },
  { from: /variant=\{t\("admin\.[^"]+\.outline"\)\}/g, to: 'variant="outline"' },
  { from: /variant:\s*\{t\("admin\.[^"]+\.ghost"\)\}/g, to: 'variant: "ghost"' },
  { from: /variant=\{t\("admin\.[^"]+\.ghost"\)\}/g, to: 'variant="ghost"' },
  { from: /variant:\s*\{t\("admin\.[^"]+\.secondary"\)\}/g, to: 'variant: "secondary"' },
  { from: /variant=\{t\("admin\.[^"]+\.secondary"\)\}/g, to: 'variant="secondary"' },
  { from: /variant:\s*\{t\("admin\.[^"]+\.link"\)\}/g, to: 'variant: "link"' },
  { from: /variant=\{t\("admin\.[^"]+\.link"\)\}/g, to: 'variant="link"' },
  { from: /variant:\s*\{t\("admin\.[^"]+\.default"\)\}/g, to: 'variant: "default"' },
  { from: /variant=\{t\("admin\.[^"]+\.default"\)\}/g, to: 'variant="default"' },
  
  // Size variants
  { from: /size:\s*\{t\("admin\.[^"]+\.icon"\)\}/g, to: 'size: "icon"' },
  { from: /size=\{t\("admin\.[^"]+\.icon"\)\}/g, to: 'size="icon"' },
  { from: /size:\s*\{t\("admin\.[^"]+\.sm"\)\}/g, to: 'size: "sm"' },
  { from: /size=\{t\("admin\.[^"]+\.sm"\)\}/g, to: 'size="sm"' },
  { from: /size:\s*\{t\("admin\.[^"]+\.lg"\)\}/g, to: 'size: "lg"' },
  { from: /size=\{t\("admin\.[^"]+\.lg"\)\}/g, to: 'size="lg"' },
  
  // Type variants
  { from: /type:\s*\{t\("admin\.[^"]+\.monotone"\)\}/g, to: 'type: "monotone"' },
  { from: /type=\{t\("admin\.[^"]+\.monotone"\)\}/g, to: 'type="monotone"' },
  
  // HTTP methods
  { from: /method:\s*\{t\("admin\.[^"]+\.post"\)\}/g, to: 'method: "POST"' },
  { from: /method:\s*\{t\("admin\.[^"]+\.get"\)\}/g, to: 'method: "GET"' },
  { from: /method:\s*\{t\("admin\.[^"]+\.patch"\)\}/g, to: 'method: "PATCH"' },
  { from: /method:\s*\{t\("admin\.[^"]+\.delete"\)\}/g, to: 'method: "DELETE"' },
  { from: /method:\s*\{t\("admin\.[^"]+\.put"\)\}/g, to: 'method: "PUT"' },
  
  // Headers
  { from: /["']Content-Type["']:\s*\{t\("admin\.[^"]+\.applicationjson"\)\}/g, to: '"Content-Type": "application/json"' },
  { from: /headers:\s*\{\s*\{t\("admin\.[^"]+\.contenttypeapplicationjson"\)\}\s*\}/g, to: 'headers: { "Content-Type": "application/json" }' },
  
  // CSS class strings (very common bad conversion)
  { from: /className=\{t\("admin\.[^"]+\.flex[^"]*"\)\}/g, to: 'className="flex items-center gap-2"' },
  { from: /className=\{t\("admin\.[^"]+\.[^"]*flex[^"]*"\)\}/g, to: 'className="flex"' },
  
  // Data testids
  { from: /data-testid=\{t\("admin\.[^"]+\.(button|input|select|card|text|link|icon)[^"]*"\)\}/g, to: 'data-testid="$1-element"' },
  
  // Common tech terms
  { from: /\{t\("admin\.[^"]+\.stackid"\)\}/g, to: '"1"' },
  { from: /name:\s*\{t\("admin\.[^"]+\.(groq|gemini|openai|huggingface|openrouter)"\)\}/g, to: 'name: "$1"' },
  { from: /dataKey:\s*\{t\("admin\.[^"]+\.(cost|groq|gemini|openai|huggingface|openrouter|kb|web)"\)\}/g, to: 'dataKey: "$1"' },
  
  // Timezone
  { from: /\{t\("admin\.[^"]+\.america[^"]*"\)\}/g, to: '"America/Sao_Paulo"' },
];

function revertFile(filePath: string): number {
  let content = readFileSync(filePath, 'utf-8');
  let reverted = 0;
  const original = content;
  
  for (const pattern of badPatterns) {
    const matches = content.match(pattern.from);
    if (matches) {
      content = content.replace(pattern.from, pattern.to);
      reverted += matches.length;
    }
  }
  
  if (content !== original) {
    writeFileSync(filePath, content, 'utf-8');
    console.log(`✅ Reverted ${reverted} bad conversions in ${filePath.split('/').pop()}`);
    return reverted;
  }
  
  return 0;
}

const files = globSync('client/src/pages/admin/*.tsx');

console.log('🔄 Reverting bad i18n conversions...\n');

let totalReverted = 0;

for (const file of files) {
  const count = revertFile(file);
  totalReverted += count;
}

console.log(`\n✅ REVERT COMPLETE: ${totalReverted} bad conversions fixed`);
