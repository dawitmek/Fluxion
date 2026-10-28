// Stands in for the Piper binary in tests: reads one line of text, writes 2 bytes of PCM per character.
// Text containing "FAIL" exits with an error, like Piper would on a bad model.
import { argv, stdin, stdout, stderr, exit } from 'node:process';

if (!argv.includes('--output_raw') || !argv.includes('--model')) {
  stderr.write('expected --model and --output_raw');
  exit(2);
}
let text = '';
stdin.on('data', (d) => (text += d));
stdin.on('end', () => {
  if (text.includes('FAIL')) {
    stderr.write('synthesis failed');
    exit(1);
  }
  stdout.write(Buffer.alloc(text.trim().length * 2, 1));
});
