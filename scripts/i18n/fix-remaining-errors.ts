import { readFileSync, writeFileSync } from 'fs';

const fixes: Array<{ file: string; from: RegExp | string; to: string }> = [
  // FederatedTrainingTab - .append pattern
  {
    file: 'client/src/pages/admin/FederatedTrainingTab.tsx',
    from: /formData\.append\(\{t\(["']([^"']+)["']\)\},/g,
    to: 'formData.append("description",'
  },
  
  // LifecyclePoliciesTab - data-testid pattern
  {
    file: 'client/src/pages/admin/LifecyclePoliciesTab.tsx',
    from: /data-testid=t\(["']([^"']+)["']\)/g,
    to: 'data-testid="error-lifecycle-policies"'
  },
  
  // NamespacesPage - .startsWith pattern
  {
    file: 'client/src/pages/admin/NamespacesPage.tsx',
    from: /\.startsWith\(\{t\(["']([^"']+)["']\)\}\)/g,
    to: '.startsWith("predefined")'
  },
  
  // PermissionsPage - console.error pattern
  {
    file: 'client/src/pages/admin/PermissionsPage.tsx',
    from: /console\.error\(\{t\(["']([^"']+)["']\)\},/g,
    to: 'console.error("Error fetching permission usage",'
  },
  
  // TokenMonitoring - ternary with {t()}
  {
    file: 'client/src/pages/admin/TokenMonitoring.tsx',
    from: /:\s*\{t\(["']admin\.tokenmonitoring\.destructive["']\)\}/g,
    to: ': "destructive"'
  },
  
  // VisionPage - variant=t() pattern
  {
    file: 'client/src/pages/admin/VisionPage.tsx',
    from: /variant=t\(["']admin\.vision\.destructive["']\)/g,
    to: 'variant="destructive"'
  },
  
  // FederatedTrainingTab - className={t()} pattern
  {
    file: 'client/src/pages/admin/FederatedTrainingTab.tsx',
    from: /className=\{t\(["']admin\.federatedtraining\.spacey6maxwfulloverflowxhidden["']\)\}/g,
    to: 'className="space-y-6 max-w-full overflow-x-hidden"'
  },
];

let totalFixed = 0;

for (const fix of fixes) {
  try {
    let content = readFileSync(fix.file, 'utf-8');
    const before = content;
    
    if (fix.from instanceof RegExp) {
      const matches = content.match(fix.from);
      if (matches) {
        content = content.replace(fix.from, fix.to);
        const count = matches.length;
        totalFixed += count;
        console.log(`✅ ${fix.file.split('/').pop()}: ${count} fixes`);
      }
    } else {
      if (content.includes(fix.from)) {
        content = content.replace(fix.from, fix.to);
        totalFixed++;
        console.log(`✅ ${fix.file.split('/').pop()}: 1 fix`);
      }
    }
    
    if (content !== before) {
      writeFileSync(fix.file, content, 'utf-8');
    }
  } catch (error) {
    console.log(`⚠️  ${fix.file}: ${error.message}`);
  }
}

console.log(`\n📊 Total fixes: ${totalFixed}`);
