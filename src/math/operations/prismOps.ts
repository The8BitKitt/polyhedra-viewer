import { Twist, twists, oppositeTwist } from "types"
import PolyhedronSpecs from "data/specs/PolyhedronSpecs"
import Capstone from "data/specs/Capstone"
import { combineOps, makeOpPair } from "./operationPairs"
import { makeOperation } from "./Operation"
import { Pose, TwistOpts, getTransformedVertices } from "./operationUtils"
import { withOrigin, getCentroid } from "math/geom"
import CapstoneForme from "math/formes/CapstoneForme"

const { PI } = Math

function getTwistMult(twist?: Twist) {
  switch (twist) {
    case "left":
      return 1
    case "right":
      return -1
    default:
      return 0
  }
}

function getCapstonePose(forme: CapstoneForme, twist?: Twist): Pose {
  const [top, bottom] = forme.baseBoundaries()
  const edge = forme.specs.isPrismatic()
    ? top.edges[0]
    : top.edges.find((e) => e.face.numSides === 3)!
  const n = top.numSides
  const angle =
    (forme.specs.isGyroelongated() ? 1 : 0) * getTwistMult(twist) * (PI / n / 2)
  return {
    origin: getCentroid([top.centroid(), bottom.centroid()]),
    scale: forme.geom.edgeLength(),
    orientation: [
      top.normal(),
      edge.v1.vec.sub(top.centroid()).getRotatedAroundAxis(top.normal(), angle),
    ],
  }
}

function getNumSides(specs: PolyhedronSpecs) {
  if (specs.isCapstone()) {
    if (specs.isPrimary()) return specs.data.base
    return 2 * specs.data.base
  }
  throw new Error(`Invalid specs: ${specs.name()}`)
}

function getScaledPrismVertices(
  forme: CapstoneForme,
  scale: number,
  twist?: Twist,
) {
  const vertexSets = forme.bases()
  const angle = (getTwistMult(twist) * PI) / getNumSides(forme.specs)

  return getTransformedVertices(vertexSets, (set) =>
    withOrigin(set.normalRay(), (v) =>
      v
        .add(set.normal().scale(scale / 2))
        .getRotatedAroundAxis(set.normal(), angle / 2),
    ),
  )
}

function doPrismTransform(
  forme: CapstoneForme,
  result: Capstone,
  twist?: Twist,
) {
  const resultForme = CapstoneForme.fromSpecs(result)
  const resultHeight =
    (resultForme.prismaticHeight() / resultForme.geom.edgeLength()) *
    forme.geom.edgeLength()
  const scale = resultHeight - forme.prismaticHeight()
  return getScaledPrismVertices(forme, scale, twist)
}

interface PrismOpArgs {
  // The list of *right* args
  query(data: Capstone): boolean
  rightElongation?: "prism" | "antiprism"
}

function makePrismOp({ query, rightElongation = "antiprism" }: PrismOpArgs) {
  const twist = rightElongation === "prism" ? undefined : "left"
  return (leftElongation: "prism" | null) => {
    return makeOpPair<CapstoneForme>({
      graph: Capstone.query
        .where(
          (s) =>
            query(s) &&
            !s.isPrismatic() &&
            s.data.elongation === rightElongation,
        )
        .map((item) => ({
          left: item.withData({ elongation: leftElongation }),
          right: item,
        })),
      middle: "right",
      getPose(side, forme) {
        return getCapstonePose(forme, twist)
      },
      toLeft(forme, $, result) {
        return doPrismTransform(forme, result, twist)
      },
    })
  }
}

const turnPrismatic = makeOpPair<CapstoneForme>({
  // Every unelongated capstone (except fastigium) can be elongated
  graph: Capstone.query
    .where((s) => s.isPrism() && !s.isDigonal())
    .map((entry) => ({
      left: entry,
      right: entry.withData({ elongation: "antiprism" }),
    })),
  middle: "right",
  getPose(side, forme) {
    return getCapstonePose(forme, "left")
  },
  toLeft: (forme, $, result) => doPrismTransform(forme, result, "left"),
})

const _elongate = makePrismOp({
  query: (s) => !s.isDigonal(),
  rightElongation: "prism",
})(null)

const canGyroelongPrimary = (s: Capstone) => s.isPrimary() && !s.isTriangular()
const canGyroelongSecondary = (s: Capstone) => s.isSecondary() && !s.isDigonal()

const pyramidOps = makePrismOp({
  query: (s) => canGyroelongPrimary(s),
})
const gyroelongPyramid = pyramidOps(null)
const turnPyramid = pyramidOps("prism")

const cupolaOps = makePrismOp({
  query: (s) => canGyroelongSecondary(s) && s.isMono(),
})

const gyroelongCupola = cupolaOps(null)
const turnCupola = cupolaOps("prism")

function makeBicupolaPrismOp(leftElongation: null | "prism") {
  return makeOpPair<CapstoneForme, TwistOpts>({
    graph: Capstone.query
      .where(
        (s) =>
          canGyroelongSecondary(s) &&
          s.isBi() &&
          s.data.elongation === leftElongation,
      )
      .flatMap((entry) => {
        return twists.map((twist) => {
          return {
            left: entry,
            right: entry.withData({
              elongation: "antiprism",
              // left twisting a gyro bicupola makes it be *left* twisted
              // but the opposite for ortho bicupolae
              twist: entry.isGyro() ? twist : oppositeTwist(twist),
            }),
            // Left and right options are opposites of each other
            options: {
              left: { twist },
              right: { twist: oppositeTwist(twist) },
            },
          }
        })
      }),
    middle: "right",
    getPose(side, forme, { right: { twist } }) {
      return getCapstonePose(forme, twist)
    },
    toLeft: (forme, { right: { twist } }, result) => {
      return doPrismTransform(forme, result, twist)
    },
  })
}

const gyroelongBicupola = makeBicupolaPrismOp(null)
const turnBicupola = makeBicupolaPrismOp("prism")

// Exported operations

export const elongate = makeOperation("elongate", _elongate.left)

export const gyroelongate = makeOperation(
  "gyroelongate",
  combineOps(
    [gyroelongPyramid, gyroelongCupola, gyroelongBicupola].map((op) => op.left),
  ),
)

export const shorten = makeOperation(
  "shorten",
  combineOps(
    [_elongate, gyroelongPyramid, gyroelongCupola, gyroelongBicupola].map(
      (op) => op.right,
    ),
  ),
)

export const turn = makeOperation(
  "turn",
  combineOps<CapstoneForme, Partial<TwistOpts>>(
    [turnPrismatic, turnPyramid, turnCupola, turnBicupola].flatMap((op) => [
      op.left,
      op.right,
    ]),
  ),
)
