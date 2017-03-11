import { connect } from 'react-redux'

import { getFilteredGroups } from '../reducers'
import Table from '../components/Table'

const mapStateToProps = state => ({
  groups: getFilteredGroups(state),
})

export default connect(mapStateToProps)(Table)