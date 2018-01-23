import _ from 'lodash'
import { geom } from 'toxiclibsjs'
const { Vec3D, Triangle3D, Plane } = geom

export const PRECISION = 1e-3

// convert an array of vertices into a vector
export const vec = p => new Vec3D(...p)

// Return whether the set of points lie on a plane
export function isPlanar(points) {
  if (points.length < 3) {
    throw new Error('Need at least three points')
  }
  const triang = _.take(points, 3)
  const plane = new Plane(new Triangle3D(...triang))
  return _.every(points, vec => plane.getDistanceToPoint(vec) < PRECISION)
}

