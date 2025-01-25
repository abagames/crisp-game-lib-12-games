title = "ELECTRON STREAM";

description = `
[Hold] Go up
`;

characters = ["./electronstream/images/background.png"];

audioFiles = {
  bgm: "./electronstream/audios/bgm.mp3",
  coin: "./electronstream/audios/coin.mp3",
  crush: "./electronstream/audios/crush.mp3",
  jump: "./electronstream/audios/jump.mp3",
  start: "./electronstream/audios/start.mp3",
  warp_rl: "./electronstream/audios/warp_rl.mp3",
  warp_ud: "./electronstream/audios/warp_ud.mp3",
};

options = {
  theme: "shapeDark",
  isPlayingBgm: true,
  isReplayEnabled: true,
  isDrawingScoreFront: true,
  isDrawingParticleFront: true,
  bgmVolume: 2,
  audioTempo: 150,
  textEdgeColor: { title: "light_yellow" },
};

// Define variables for game objects
/** @type {{pos: Vector, vel: Vector, damagedTicks: number}} */
let electronStream;
/** @type {{pos: Vector, vel: Vector, dir: number}[]} */
let reverseCurrents;
let nextCurrentSpawnDist;
let bgX;
let multiplier;
const electronSpeed = 1;
let streamLength;

function update() {
  if (!ticks) {
    // Initialize electron stream at center-left of screen
    electronStream = {
      pos: vec(10, 50),
      vel: vec(1, 0),
      damagedTicks: 0,
    };
    reverseCurrents = [
      {
        pos: vec(99, 50),
        vel: vec(-1, 0),
        dir: 1,
      },
    ];
    nextCurrentSpawnDist = 0;
    bgX = 0;
    multiplier = 1;
    streamLength = 9;
    play("start");
  }
  const sd = sqrt(difficulty / 2);
  color("black");
  bgX -= sd;
  if (bgX < -128) {
    bgX += 256;
  }
  char("a", bgX, 50);
  char("a", bgX + 256, 50);

  // Update electron stream movement
  if (input.isJustPressed) {
    play("jump");
  }
  if (input.isPressed) {
    electronStream.vel.y -= 0.1;
  } else {
    electronStream.vel.y += 0.1;
  }
  // Limit vertical velocity
  electronStream.vel.y = clamp(electronStream.vel.y, -1, 1);

  // Update electron stream position
  electronStream.pos.add(vec(electronStream.vel).mul(electronSpeed * sd));

  // Wrap around from right to left
  if (electronStream.pos.x > 100) {
    play("warp_rl");
    electronStream.pos.x = 0;
    multiplier++;
  }

  // Wrap around vertically
  if (electronStream.pos.y > 100) {
    play("warp_ud");
    electronStream.pos.y = 0;
  } else if (electronStream.pos.y < 0) {
    play("warp_ud");
    electronStream.pos.y = 100;
  }
  streamLength += (9 - streamLength) * 0.002;

  // Draw electron stream
  color("cyan");
  bar(electronStream.pos, streamLength, 3, electronStream.vel.angle);
  if (streamLength < 8) {
    const damage = 9 - streamLength;
    electronStream.damagedTicks++;
    const damagedDuration = 50 - damage * 7;
    if (electronStream.damagedTicks > damagedDuration) {
      electronStream.damagedTicks = 0;
    }
    if (electronStream.damagedTicks < damagedDuration / 2) {
      color("purple");
      bar(electronStream.pos, streamLength, 3, electronStream.vel.angle);
    }
  }

  // Spawn and update reverse currents
  nextCurrentSpawnDist -= sd;
  if (nextCurrentSpawnDist <= 0) {
    const yPos = rnd(20, 80);
    reverseCurrents.push({
      pos: vec(150, yPos),
      vel: vec(-1, 0),
      dir: yPos < electronStream.pos.y ? 1 : -1,
    });
    nextCurrentSpawnDist = rnd(30, 50);
  }

  // Draw lines between consecutive reverse currents
  if (reverseCurrents.length >= 2) {
    color("yellow");
    for (let i = 1; i < reverseCurrents.length; i++) {
      const curr = reverseCurrents[i];
      const prev = reverseCurrents[i - 1];
      // Only draw line if at least one point is on screen
      if (curr.pos.x < 105 || prev.pos.x < 105) {
        const c = line(curr.pos, prev.pos, 1).isColliding.rect;
        if (c.cyan) {
          play("coin");
          addScore(
            multiplier,
            ticks % 5 === 0 ? electronStream.pos : undefined
          );
        }
      }
    }
  }

  // Update and draw reverse currents
  color("red");
  remove(reverseCurrents, (rc) => {
    rc.vel.y = rc.dir * 0.5;
    rc.pos.add(vec(rc.vel).mul(sd));

    color("red");
    box(rc.pos, 5).isColliding.rect;
    color("transparent");
    const c = box(rc.pos, 2).isColliding.rect;
    if (c.cyan) {
      // Game over on collision with electron stream
      color("blue");
      particle(electronStream.pos, { count: 3, speed: 2, edgeColor: "purple" });
      multiplier--;
      if (multiplier < 1) {
        multiplier = 1;
      }
      play("crush");
      streamLength -= sd;
      if (streamLength < 3) {
        end();
      }
    }

    // Remove if off screen
    return rc.pos.x < -50;
  });

  color("black");
  text(`x${multiplier}`, 3, 9, { isSmallText: true });
}
