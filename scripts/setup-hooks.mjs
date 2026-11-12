// npm install / npm ci 時に、このリポジトリの git フックを有効にする。
// git リポジトリの外(配布用の tarball など)では何もしない。
import { execSync } from 'node:child_process';

try {
  execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' });
  execSync('git config core.hooksPath .githooks', { stdio: 'ignore' });
  console.log('[prepare] git core.hooksPath を .githooks に設定しました');
} catch {
  console.log('[prepare] git リポジトリではないため、フックの設定を省略しました');
}
