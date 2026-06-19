async function bootstrap() {
  const { Game } = await import('./Game.js');
  const game = new Game();
  game.run();
}

bootstrap();
