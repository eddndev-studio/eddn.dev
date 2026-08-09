---
title: "Una subasta privada como prueba de integración de Achronyme"
description: "Un recorrido detallado por un programa de Achronyme que une concurrencia estructurada, capacidades, compromisos Poseidon, pertenencia Merkle y una prueba Groth16."
pubDate: "2026-08-09"
tags: ["achronyme", "concurrencia-estructurada", "conocimiento-cero", "groth16", "pruebas-de-integracion"]
draft: false
translationKey: "achronyme-private-auction-integration-test"
abstract: "Este artículo sigue una subasta de tres postores desde tareas TCP acotadas hasta una prueba Groth16 separada. Define con precisión la afirmación del circuito, separa las validaciones del host de las restricciones de la prueba, explica las cuatro entradas públicas y los nueve valores testigo, y registra los límites de seguridad y motores que exigen los contratos."
technicalDepth: "Advanced"
references:
  - "https://achrony.me/es/docs/language/concurrency-and-io/"
  - "https://github.com/achronyme/achronyme/releases/tag/v0.1.0"
  - "https://eprint.iacr.org/2016/260.pdf"
  - "https://eprint.iacr.org/2019/458.pdf"
---

El programa se llama **Prueba de integración de subasta privada** y su directorio de trabajo es `private-auction-integration-test`.

Este programa determinista para Achronyme 0.1.0 obliga a varios límites del lenguaje a interactuar en una sola ejecución:

1. Los módulos con espacios de nombres separan orquestación, transporte, lógica de prueba, registro y almacenamiento de artefactos.
2. La concurrencia estructurada es propietaria de seis tareas hijas, incluido un plazo límite.
3. Un canal acotado aplica contrapresión entre el servidor TCP y su consumidor.
4. Las capacidades explícitas del host restringen el programa a una dirección de loopback y un directorio de salida.
5. Un circuito Groth16 verifica la apertura de tres compromisos Poseidon, un ganador estricto y una ruta de pertenencia Merkle.
6. El programa verifica la prueba dentro del proceso, guarda un paquete separado y vuelve a verificarlo en un proceso nuevo de la CLI.

"Bob gana" proporciona el fixture. La prueba ejercita un límite inspeccionable entre la ejecución ordinaria del host y una afirmación de conocimiento cero, y después lleva el resultado por la serialización y una verificación independiente.

## El resultado observado

Ejecuté el proyecto con `ach 0.1.0`, el motor intérprete, ofertas de 500, 750 y 300, y un directorio de salida nuevo. La ejecución aceptó tres compromisos, generó y verificó una prueba Groth16, escribió cuatro artefactos y terminó con:

```text
commitments accepted: 3
Proof generated (Groth16, 854 bytes)
Proof verified - 1,864 constraints
winner proof verified: true
artifact bytes written: 4128
PASS: private_auction_integration_test
```

Los bytes exactos de la prueba son aleatorios y no deben repetirse entre ejecuciones. El recibo sí es determinista porque esta prueba fija deliberadamente sus entradas y nonces.

Con `--circuit-stats`, la misma ejecución reportó 4 entradas públicas, 9 valores testigo, 22 instrucciones de IR contabilizadas y una estimación de 2,501 restricciones R1CS:

| Categoría | Instrucciones IR | Restricciones estimadas | Proporción |
|---|---:|---:|---:|
| Hashes Poseidon | 5 | 1,809 | 72.3% |
| Comparaciones | 3 | 578 | 23.1% |
| Comprobaciones de rango | 3 | 99 | 4.0% |
| Selecciones | 4 | 8 | 0.3% |
| Aserciones | 7 | 7 | 0.3% |

Las cifras 2,501 y 1,864 no se contradicen. Las estadísticas son estimaciones obtenidas del IR de circuito optimizado. Antes de generar la prueba, el backend R1CS elimina restricciones lineales y reporta las 1,864 que permanecen en el sistema de prueba real. Un número describe el modelo de costo previo a la emisión; el otro describe el R1CS final usado por Groth16.

## La afirmación antes de la implementación

Sea `H` el hash Poseidon de dos entradas de Achronyme sobre BN254. El verificador recibe cuatro elementos de campo públicos en este orden:

```text
C_bob, C_alice, C_charlie, registry_root
```

El probador proporciona 9 valores testigo:

```text
b_alice, b_bob, b_charlie,
n_alice, n_bob, n_charlie,
bob_leaf, lower_sibling, upper_sibling
```

El circuito demuestra que existen valores testigo que satisfacen todo lo siguiente:

```text
H(b_bob,     n_bob)     = C_bob
H(b_alice,   n_alice)   = C_alice
H(b_charlie, n_charlie) = C_charlie

0 <= b_alice   < 2^32
0 <= b_bob     < 2^32
0 <= b_charlie < 2^32

b_bob > 0
b_bob > b_alice
b_bob > b_charlie

MerkleVerify(
    registry_root,
    bob_leaf,
    [lower_sibling, upper_sibling],
    [1, 0]
)
```

En lenguaje directo: el compromiso identificado como el de Bob se abre a una oferta positiva de 32 bits, estrictamente mayor que las otras dos ofertas comprometidas de 32 bits, y la hoja proporcionada para el ganador ocupa la posición esperada bajo la raíz pública del registro.

Esa es la afirmación criptográfica. El resto de la aplicación se encarga de reunir los compromisos públicos, elegir la raíz pública, suministrar el testigo, controlar el acceso al host y conservar los artefactos de la prueba.

## Datos públicos y datos testigo privados

El límite es más fácil de inspeccionar en una tabla:

| Valor | Visibilidad en el circuito | Aparece en el recibo | Viaja por TCP local |
|---|---|---|---|
| Compromiso de Bob | Público | Sí | Sí |
| Compromiso de Alice | Público | Sí | Sí |
| Compromiso de Charlie | Público | Sí | Sí |
| Raíz del registro | Público | Sí | No |
| Tres ofertas | Testigo | No | No |
| Tres nonces | Testigo | No | No |
| Hoja de Bob en el registro | Testigo | No | No |
| Dos hermanos Merkle | Testigo | No | No |

"Testigo" significa que los valores están ausentes de la entrada pública del verificador. El ocultamiento todavía depende del esquema de compromiso de la aplicación y de los nonces elegidos.

Esta prueba usa nonces fijos: 1111, 2222 y 3333. Los valores fijos vuelven deterministas las ejecuciones y dejan las ofertas de dominio pequeño expuestas a un ataque de diccionario. Quien conozca el código y vea un compromiso puede calcular el hash de ofertas plausibles con el nonce conocido hasta encontrar una coincidencia. El alcance demostrado cubre la separación de testigos y el recorrido de una prueba. Un diseño de producción requiere valores de ocultamiento impredecibles y únicos, además de un protocolo para protegerlos.

## Cinco módulos y un orquestador

La primera versión del programa pudo haber colocado cada operación en `main.ach`. En su lugar, el sistema de módulos de Achronyme asigna un propietario a cada límite:

```text
src/main.ach
|-- transport.ach   tareas TCP, canal, plazo y resultados de tareas
|-- auction.ach     compromisos, afirmación de prueba y formato del recibo
|-- registry.ach    cuatro hojas, raíz y ruta de pertenencia del ganador
`-- artifacts.ach   escrituras concurrentes y relectura del recibo
```

`main.ach` importa cada archivo dentro de un espacio de nombres:

```ach
import "./transport.ach" as transport
import "./auction.ach" as auction
import "./registry.ach" as registry
import "./artifacts.ach" as artifacts
```

El orquestador lee entradas, llama funciones exportadas como `transport::exchange_commitments` y entrega cada resultado a la siguiente etapa. Los auxiliares `submit_commitment`, `collect_commitments` y `write_artifact` permanecen privados dentro de sus módulos.

El contrato de fuente hace exigible esta separación de responsabilidades. Rechaza primitivas de red, creación de archivos, `prove winner` o `merkle_verify` si regresan a `main.ach`, y limita ese archivo a 90 líneas. Una regresión no puede convertir silenciosamente al orquestador en una segunda implementación de los módulos.

## Etapa 1: entradas del host y compromisos

El programa lee una dirección, un directorio de salida y tres ofertas enteras. Convierte las ofertas a elementos de campo y rechaza entradas no positivas antes de iniciar el protocolo:

```ach
let alice_bid = parse_int(read_line()).to_field()
let bob_bid = parse_int(read_line()).to_field()
let charlie_bid = parse_int(read_line()).to_field()

assert(alice_bid > 0p0)
assert(bob_bid > 0p0)
assert(charlie_bid > 0p0)
```

Esas tres aserciones son comprobaciones del host. El circuito de prueba repite la positividad solo para Bob. Comprueba el rango de Alice y Charlie, pero permitiría que cualquiera fuera cero si otra ruta del host llamara directamente a la función de prueba.

La distinción importa:

- La aplicación completa acepta tres ofertas positivas.
- La prueba separada establece que Bob es positivo y estrictamente mayor que dos ofertas de 32 bits.

Los compromisos se calculan fuera del circuito:

```ach
export fn commitment(bid, nonce) {
    poseidon(bid, nonce)
}
```

El circuito vuelve a calcular los tres hashes. El host no puede sustituir otra oferta u otro nonce sin romper la igualdad del compromiso público correspondiente.

## Etapa 2: transporte concurrente estructurado

El módulo de transporte abre el listener de loopback antes de crear los clientes y después crea `channel(1)`. La capacidad de uno es deliberadamente menor que la carga de tres mensajes. El servidor no puede encolar todos los compromisos y adelantarse sin límite; `channel_send` se suspende cuando el único espacio está ocupado hasta que el consumidor recibe.

Dentro de un scope `concurrent`, el módulo crea seis tareas:

```ach
let server_task = spawn collect_commitments(listener, commitment_events)
let consumer_task = spawn consume_commitments(commitment_events)
let deadline_task = spawn timeout_after(2000)

let alice_task = spawn submit_commitment(address, "alice", commit_alice, 1)
let bob_task = spawn submit_commitment(address, "bob", commit_bob, 2)
let charlie_task = spawn submit_commitment(address, "charlie", commit_charlie, 3)
```

Cada cliente espera un retraso pequeño y distinto, se conecta, envía solo `bidder:commitment`, espera `accepted` y cierra su conexión. El servidor acepta exactamente tres conexiones. Un consumidor separado drena exactamente tres mensajes del canal y cede la ejecución entre recepciones.

El servidor compite contra el plazo:

```ach
let server_race = await [server_task, deadline_task] as race
assert(server_race["index"] == 0)
assert(server_race["ok"] == true)
assert(server_race["value"] == 3)
```

Si el servidor termina primero, debe haber tenido éxito y devuelto tres. El scope estructurado cancela y espera a la tarea temporizadora perdedora. Si gana el temporizador, falla la aserción del índice y el fallo del scope solicita la cancelación cooperativa de los demás hijos.

Las tareas cliente usan `await task as outcome`, que convierte éxito o fallo en datos antes de que el módulo compruebe cada campo `ok`. El consumidor usa un `await` normal, por lo que un fallo no controlado se propaga por el scope. Ninguna tarea se separa y ningún handle escapa.

Cuando cada hijo alcanza un estado terminal, el scope devuelve la cantidad consumida. Solo entonces el módulo cierra el canal del que es propietario.

## Etapa 3: un registro fijo de cuatro hojas

El registro es pequeño y determinista a propósito. Sus hojas son:

```text
L_alice   = H(101, 9001)
L_bob     = H(102, 9002)
L_charlie = H(103, 9003)
L_reserve = H(104, 9004)
```

La raíz pública es:

```text
right = H(L_charlie, L_reserve)
root  = H(H(L_alice, L_bob), right)
```

La ruta testigo de Bob es `[L_alice, right]` con índices de dirección `[1, 0]`. En el primer nivel Bob es el hijo derecho, por lo que Alice se coloca a la izquierda. En el segundo nivel el nodo Alice/Bob es el hijo izquierdo, por lo que el nodo Charlie/reserva se coloca a la derecha.

Los dos niveles Merkle explican dos de los cinco hashes Poseidon del circuito. Los otros tres abren los compromisos de las ofertas.

El circuito demuestra pertenencia bajo la raíz suministrada. No demuestra que la carga numérica 102 de la hoja sea legal o socialmente "Bob". El verificador necesita una definición externa del registro que vincule la raíz pública y la posición de la hoja con las identidades de los postores.

## Etapa 4: el circuito Groth16 del ganador

El módulo de prueba declara en la lista de parámetros de `prove` solo los cuatro valores visibles para el verificador. Cada valor capturado y usado por el cuerpo se convierte en dato testigo:

```ach
let proof = prove winner(
    commit_bob: Public,
    commit_alice: Public,
    commit_charlie: Public,
    registry_root: Public
) {
    assert_eq(poseidon(bob_bid, bob_nonce_value), commit_bob)
    assert_eq(poseidon(alice_bid, alice_nonce_value), commit_alice)
    assert_eq(poseidon(charlie_bid, charlie_nonce_value), commit_charlie)

    range_check(alice_bid, 32)
    range_check(bob_bid, 32)
    range_check(charlie_bid, 32)
    assert(bob_bid > 0p0)
    assert(bob_bid > alice_bid)
    assert(bob_bid > charlie_bid)

    let bob_path: Field[2] = [bob_lower_sibling, bob_upper_sibling]
    let bob_indices: Field[2] = [0p1, 0p0]
    merkle_verify(registry_root, bidder_bob, bob_path, bob_indices)
}
```

Las comprobaciones de rango de 32 bits son esenciales. Las comparaciones sobre un campo primo necesitan una interpretación entera con un límite conocido. Sin él, los valores cercanos al módulo podrían interpretarse de manera incompatible con ofertas ordinarias sin signo.

Las comprobaciones estrictas `>` rechazan un empate que involucre a Bob. No existe una restricción que compare a Alice con Charlie porque su orden relativo no afecta la afirmación sobre el ganador designado.

Bob está designado por la interfaz del circuito. El circuito verifica que el compromiso designado vence a estas dos alternativas; no busca en una lista arbitraria para elegir un ganador. Eso basta para esta prueba de integración y es demasiado estrecho para un protocolo general de subastas.

## Etapa 5: verificación y propiedad de artefactos

La prueba devuelta es un valor de primera clase en el host. `main.ach` llama inmediatamente a `verify_proof` y se niega a continuar si el resultado no es verdadero. Esto detecta un fallo antes de producir el recibo. La verificación separada aporta la comprobación final de portabilidad.

El módulo de artefactos serializa cuatro documentos independientes:

```text
proof.json
public.json
verification_key.json
receipt.txt
```

Los escribe con cuatro tareas dentro de un segundo scope `concurrent`. Cada tarea crea un archivo propio, escribe su contenido, lo cierra de forma explícita y devuelve el número de bytes. El padre espera los cuatro conteos y los suma.

Después de salir del scope, el módulo abre `receipt.txt`, lo lee, cierra el handle y compara el resultado completo de `read_file` con el recibo original. El recibo expone la etiqueta del ganador, tres compromisos, la raíz y la cantidad aceptada. No contiene ofertas ni nonces.

El paquete resultante basta para verificar en un proceso nuevo:

```sh
ach verify \
  --proof build/demo-output/proof.json \
  --public build/demo-output/public.json \
  --vkey build/demo-output/verification_key.json \
  --curve bn254 \
  --format json
```

El JSON esperado contiene `"valid": true`. La verificación separada importa porque una comprobación dentro del proceso podría depender accidentalmente de estado de circuito en caché o de objetos que nunca se serializaron.

## Las capacidades y la autoridad de prueba son distintas

El runner concede cuatro permisos del host con destinos exactos:

```sh
--allow-read "$OUTPUT_DIR"
--allow-write "$OUTPUT_DIR"
--allow-connect "$ADDRESS"
--allow-listen "$ADDRESS"
```

También habilita parámetros locales de prueba con `--insecure-dev-setup`. Son dos decisiones de autoridad independientes:

- Las capacidades de archivo y red deciden a qué recursos del host puede acceder el programa.
- La fuente de claves de prueba decide si se permite generar una prueba y en qué material de setup confía.

El contrato de seguridad ejecuta el programa sin permisos del host y exige un fallo de capacidades. Después concede los recursos del host, omite la autoridad de prueba y exige que la generación falle. Pasar un límite nunca implica permiso en el otro.

El proyecto también establece presupuestos finitos para la VM: 16 tareas, 16 recursos, 16 scopes de tareas, 16 solicitudes nativas pendientes, 4 canales y 16 operaciones de canal. Ejecutar el mismo programa con `PRIVATE_AUCTION_MAX_TASKS=2` debe fallar por límite de recursos en vez de asignar más de forma silenciosa.

## Las pruebas negativas forman parte del resultado

Una prueba exitosa dice poco sobre si las comprobaciones alrededor están conectadas correctamente. El proyecto ataca varias suposiciones:

| Contrato | Mutación o autoridad ausente | Resultado exigido |
|---|---|---|
| Fuente | Mover transporte, prueba o archivos a `main.ach` | Falla el contrato estático |
| Capacidades del host | Omitir permisos de archivo y red | El programa falla antes del acceso no autorizado |
| Autoridad de prueba | Omitir el almacén confiable y el setup de desarrollo | La generación falla de forma cerrada |
| Presupuesto de tareas | Reducir el máximo de 16 a 2 | Fallo por límite de recursos |
| Restricción de ganador | Elevar la oferta de Alice a 900 y mantener la de Bob en 750 | Circuito insatisfecho o fallo de prueba |
| Vinculación pública | Cambiar la primera entrada pública después de probar | La verificación separada devuelve `valid: false` |
| Forma del paquete | Quitar o corromper prueba, entrada pública, clave o recibo | Falla el contrato de extremo a extremo |

El caso de la entrada pública alterada es especialmente importante. Una prueba válida está vinculada a sus entradas públicas. Reutilizar la misma prueba con otro compromiso ganador declarado no debe verificar.

## Intérprete, JIT y el límite AOT

El contrato de motores ejecuta el programa completo dos veces: una con el intérprete y otra con el LLVM JIT. Exige recibos idénticos byte por byte y verifica ambas pruebas separadas en procesos nuevos.

La igualdad de las pruebas byte por byte queda fuera del contrato porque la generación Groth16 es aleatoria. La equivalencia entre motores exige el mismo recibo público y paquetes de prueba válidos de manera independiente.

La prueba también inspecciona el manifiesto compilado y exige estos efectos:

```text
task,io.console,io.file,io.network,io.clock,prove,verify,circuit
```

Finalmente intenta una compilación AOT independiente. El runtime AOT instalado de Achronyme 0.1.0 no proporciona `PROVE`, `VERIFY` ni `CIRCOM`, por lo que debe rechazar este programa híbrido. El fallo esperado documenta un límite de capacidades. Sería engañoso afirmar soporte AOT después de compilar solo el esqueleto del host y omitir la etapa de prueba.

## Lo que demuestra y lo que no demuestra

El paquete verificado establece una afirmación estrecha:

> Para los cuatro elementos de campo públicos de `public.json`, existe un testigo de 9 valores que abre los tres compromisos a ofertas acotadas, hace que la oferta designada de Bob sea positiva y estrictamente mayor, y autentica la hoja designada del registro bajo la raíz pública en la ruta `[1, 0]`.

La aplicación completa también valida entradas positivas en el host, recibe tres mensajes de compromiso antes de un plazo, cierra los recursos propios, respeta los presupuestos configurados y escribe un paquete autocontenido de verificación.

No demuestra:

- que no exista un cuarto postor;
- que todos los postores elegibles hayan podido participar;
- que el emisor de red sea propietario de la identidad escrita antes de los dos puntos;
- que la raíz del registro represente una lista de postores con autoridad legal;
- que los nonces fijos oculten ofertas de dominio pequeño;
- que los mensajes sean confidenciales o autenticados solo por usar TCP;
- que exista una política justa de empates, retiros, repetición o sesiones;
- que el setup Groth16 local y de una sola parte sea seguro para producción;
- que el runtime AOT independiente pueda ejecutar efectos de prueba.

Estas exclusiones definen la frontera entre una prueba útil de integración del lenguaje y un protocolo de subasta desplegable.

## Lo que exigiría producción

Una versión de producción necesitaría al menos:

1. Valores de ocultamiento impredecibles y únicos, con un protocolo para guardarlos o derivarlos de forma segura.
2. Un identificador de subasta vinculado a la afirmación pública para evitar reutilización entre sesiones.
3. Registro autenticado de postores y transporte autenticado que vinculen cada identidad con una sesión y sus credenciales.
4. Un registro dinámico con una regla publicada que conecte identidades, hojas, posiciones y raíces.
5. Una afirmación general para seleccionar al ganador, incluida la política de empates y ofertas inválidas.
6. Una clave de prueba derivada de ceremonia para este circuito optimizado exacto, cargada desde un almacén confiable sin `--insecure-dev-setup`.
7. Límites operativos dimensionados a partir de cargas medidas, con fallos y recuperación comprobados bajo saturación.
8. Una decisión sobre el destino de los efectos de prueba: despliegue con intérprete/JIT hoy, o soporte adicional en el runtime AOT antes de afirmar ejecución independiente.

## Ejecución de los contratos

Con el proyecto de integración y Achronyme 0.1.0 instalados, la ejecución positiva es:

```sh
./scripts/run-demo.sh
```

Los cuatro contratos se pueden ejecutar por separado:

```sh
bash test/source_contract.sh
bash test/e2e.sh
bash test/security_contract.sh
bash test/engine_contract.sh
```

En la ejecución documentada aquí, los cuatro pasaron. En conjunto cubren el camino exitoso, la responsabilidad de la fuente, la ejecución acotada en el host, la autoridad cerrada por defecto, el rechazo de restricciones, la vinculación de entradas públicas, la portabilidad de artefactos, el acuerdo entre motores y una capacidad AOT no soportada de forma explícita.

La subasta privada funciona como una prueba seria de integración de Achronyme porque transporta una afirmación desde I/O concurrente, a través de un circuito, hasta un artefacto separado que otro proceso puede rechazar o verificar. Sus límites explícitos forman parte del resultado.
