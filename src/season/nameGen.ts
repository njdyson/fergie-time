/**
 * Procedural player name generation with nationality-weighted pools.
 */

const NAME_POOLS = {
  english: {
    weight: 0.40,
    first: [
      'James', 'Harry', 'Jack', 'Oliver', 'Thomas', 'George', 'Charlie', 'William',
      'Daniel', 'Joshua', 'Alexander', 'Samuel', 'Joseph', 'Benjamin', 'Ethan',
      'Matthew', 'Ryan', 'Luke', 'Callum', 'Nathan', 'Connor', 'Adam',
    ] as readonly string[],
    last: [
      'Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson', 'Johnson', 'Davies',
      'Robinson', 'Wright', 'Thompson', 'Evans', 'Walker', 'White', 'Roberts',
      'Green', 'Hall', 'Wood', 'Jackson', 'Clarke', 'Harris', 'Turner',
    ] as readonly string[],
  },
  spanish: {
    weight: 0.25,
    first: [
      'Carlos', 'Miguel', 'Alejandro', 'Pablo', 'Diego', 'Sergio', 'Alvaro', 'Jorge',
      'Adrian', 'Raul', 'Fernando', 'Marcos', 'Antonio', 'Javier', 'Andres',
      'David', 'Roberto', 'Pedro', 'Manuel', 'Rafael', 'Luis', 'Enrique',
    ] as readonly string[],
    last: [
      'Garcia', 'Martinez', 'Lopez', 'Hernandez', 'Gonzalez', 'Rodriguez', 'Sanchez',
      'Perez', 'Martin', 'Gomez', 'Ruiz', 'Diaz', 'Moreno', 'Alvarez', 'Romero',
      'Torres', 'Navarro', 'Dominguez', 'Vazquez', 'Ramos', 'Gil', 'Serrano',
    ] as readonly string[],
  },
  french: {
    weight: 0.20,
    first: [
      'Antoine', 'Lucas', 'Hugo', 'Louis', 'Gabriel', 'Theo', 'Raphael', 'Jules',
      'Arthur', 'Leo', 'Mathis', 'Nathan', 'Ethan', 'Paul', 'Maxime',
      'Adrien', 'Baptiste', 'Clement', 'Romain', 'Alexandre', 'Julien', 'Pierre',
    ] as readonly string[],
    last: [
      'Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand',
      'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefebvre', 'Michel', 'Garcia',
      'David', 'Bertrand', 'Roux', 'Vincent', 'Fournier', 'Morel', 'Girard',
    ] as readonly string[],
  },
  german: {
    weight: 0.10,
    first: [
      'Lukas', 'Leon', 'Finn', 'Jonas', 'Felix', 'Noah', 'Elias', 'Paul',
      'Max', 'Ben', 'Luca', 'Tim', 'Julian', 'Nico', 'Moritz',
      'Jan', 'Philipp', 'David', 'Tom', 'Fabian', 'Tobias', 'Florian',
    ] as readonly string[],
    last: [
      'Mueller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner',
      'Becker', 'Schulz', 'Hoffmann', 'Schaefer', 'Koch', 'Bauer', 'Richter',
      'Klein', 'Wolf', 'Schroeder', 'Neumann', 'Schwarz', 'Zimmermann', 'Braun', 'Hartmann',
    ] as readonly string[],
  },
  brazilian: {
    weight: 0.05,
    first: [
      'Lucas', 'Gabriel', 'Matheus', 'Rafael', 'Gustavo', 'Felipe', 'Bruno', 'Pedro',
      'Thiago', 'Leonardo', 'Vinicius', 'Henrique', 'Eduardo', 'Diego', 'Rodrigo',
      'Fernando', 'Anderson', 'Marcelo', 'Caio', 'Fabio', 'Renato', 'Adriano',
    ] as readonly string[],
    last: [
      'Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves',
      'Pereira', 'Lima', 'Gomes', 'Costa', 'Ribeiro', 'Martins', 'Carvalho',
      'Almeida', 'Lopes', 'Soares', 'Fernandes', 'Vieira', 'Barbosa', 'Rocha', 'Dias',
    ] as readonly string[],
  },
} as const;

type NationalityKey = keyof typeof NAME_POOLS;

const NATIONALITIES: NationalityKey[] = ['english', 'spanish', 'french', 'german', 'brazilian'];

// Pre-compute cumulative weights
const CUMULATIVE_WEIGHTS: number[] = [];
{
  let cum = 0;
  for (const key of NATIONALITIES) {
    cum += NAME_POOLS[key].weight;
    CUMULATIVE_WEIGHTS.push(cum);
  }
}

/**
 * Generate a player name from nationality-weighted pools.
 * @param rng - A function returning a number in [0, 1)
 * @returns A "Firstname Lastname" string
 */
export function generatePlayerName(rng: () => number): string {
  const r = rng();
  let nationality: NationalityKey = 'english';
  for (let i = 0; i < CUMULATIVE_WEIGHTS.length; i++) {
    if (r < CUMULATIVE_WEIGHTS[i]!) {
      nationality = NATIONALITIES[i]!;
      break;
    }
  }

  const pool = NAME_POOLS[nationality];
  const firstName = pool.first[Math.floor(rng() * pool.first.length)]!;
  const lastName = pool.last[Math.floor(rng() * pool.last.length)]!;

  return `${firstName} ${lastName}`;
}
